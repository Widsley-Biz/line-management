import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mobileUsages, tenants } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import jsforce from "jsforce";
import type { Connection } from "jsforce";
import { logActivity } from "@/lib/audit";

// 利用月から請求月（+2ヶ月）を計算
function getBillingMonth(yearMonth: string): { startDate: string; endDate: string; billingMonth: string } {
  const [year, month] = yearMonth.split("-").map(Number);
  const billingDate = new Date(year, month - 1 + 2, 1);
  const billingYear = billingDate.getFullYear();
  const billingMonth = billingDate.getMonth() + 1;
  const billingYM = `${billingYear}-${String(billingMonth).padStart(2, "0")}`;
  const lastDay = new Date(billingYear, billingMonth, 0).getDate();
  return {
    billingMonth: billingYM,
    startDate: `${billingYM}-01`,
    endDate: `${billingYM}-${String(lastDay).padStart(2, "0")}`,
  };
}

async function getSFConnection(): Promise<Connection> {
  const clientId = process.env.SF_CLIENT_ID;
  const clientSecret = process.env.SF_CLIENT_SECRET;
  const instanceUrl = process.env.SF_INSTANCE_URL ?? "https://login.salesforce.com";

  if (!clientId || !clientSecret) {
    throw new Error("SF_CLIENT_ID または SF_CLIENT_SECRET が設定されていません");
  }

  const tokenRes = await fetch(`${instanceUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`SF認証エラー: ${err}`);
  }

  const token = await tokenRes.json() as { access_token: string; instance_url: string };

  return new jsforce.Connection({
    instanceUrl: token.instance_url,
    accessToken: token.access_token,
  });
}

async function sendToSF(
  conn: Connection,
  usage: { id: string; tenantId: string; yearMonth: string; overageTotal: number },
  tenant: { sfOpportunityId: string | null; companyName: string }
): Promise<void> {
  if (!tenant.sfOpportunityId) {
    throw new Error(`SF商談IDが設定されていません（${tenant.companyName}）`);
  }

  const { startDate, endDate } = getBillingMonth(usage.yearMonth);
  const [usageYear, usageMonth] = usage.yearMonth.split("-").map(Number);

  console.log("PricebookEntryId:", process.env.SF_PRICEBOOK_ENTRY_ID_MOBILE);
  console.log("Pricebook2Id:", process.env.SF_PRICEBOOK2_ID);

  // 商談に価格表をセット
  await (conn.sobject("Opportunity") as unknown as {
    update: (item: object) => Promise<{ success: boolean; errors?: unknown[] }>;
  }).update({
    Id: tenant.sfOpportunityId,
    Pricebook2Id: process.env.SF_PRICEBOOK2_ID,
  });

  const lineItem = {
    OpportunityId: tenant.sfOpportunityId,
    PricebookEntryId: process.env.SF_PRICEBOOK_ENTRY_ID_MOBILE,
    UnitPrice: Math.round(usage.overageTotal),
    Quantity: 1,
    Billing_start_date__c: startDate,
    billing_end_date__c: endDate,
    Description: `${usageYear}年${usageMonth}月携帯利用分として`,
  };

  const results = await (conn.sobject("OpportunityLineItem") as unknown as {
    create: (items: object[]) => Promise<Array<{ success: boolean; errors?: unknown[] }>>;
  }).create([lineItem]);

  for (const r of results) {
    if (!r.success) {
      throw new Error(`SF送信エラー: ${JSON.stringify(r.errors)}`);
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, yearMonth, usageIds } = body as {
      tenantId?: string;
      yearMonth?: string;
      usageIds?: string[];
    };

    let targetUsages: typeof mobileUsages.$inferSelect[] = [];

    if (usageIds && usageIds.length > 0) {
      targetUsages = await db
        .select()
        .from(mobileUsages)
        .where(inArray(mobileUsages.id, usageIds));
    } else if (tenantId && yearMonth) {
      targetUsages = await db
        .select()
        .from(mobileUsages)
        .where(
          and(
            eq(mobileUsages.tenantId, tenantId),
            eq(mobileUsages.yearMonth, yearMonth)
          )
        )
        .limit(1);
    } else {
      return NextResponse.json({ error: "パラメータが不正です" }, { status: 400 });
    }

    if (targetUsages.length === 0) {
      return NextResponse.json({ error: "対象データが見つかりません" }, { status: 404 });
    }

    const pending = targetUsages.filter((u) =>
      u.sfStatus === "未送信" || u.sfStatus === "エラー"
    );

    if (pending.length === 0) {
      return NextResponse.json({ message: "送信対象がありません（既に送信済みです）" });
    }

    const conn = await getSFConnection();

    const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
      .toISOString()
      .replace("Z", "+09:00");

    const tenantIds = [...new Set(pending.map((u) => u.tenantId))];
    const tenantRows = await db
      .select({ id: tenants.id, companyName: tenants.companyName, sfOpportunityId: tenants.sfOpportunityId })
      .from(tenants)
      .where(inArray(tenants.id, tenantIds));
    const tenantMap = new Map(tenantRows.map((t) => [t.id, t]));

    const results = { success: 0, errors: [] as string[] };

    for (const usage of pending) {
      const tenant = tenantMap.get(usage.tenantId);
      if (!tenant) {
        results.errors.push(`テナントが見つかりません: ${usage.tenantId}`);
        await db.update(mobileUsages)
          .set({ sfStatus: "エラー", sfErrorMessage: "テナントが見つかりません", updatedAt: now })
          .where(eq(mobileUsages.id, usage.id));
        continue;
      }

      if (usage.overageTotal <= 0) {
        await db.update(mobileUsages)
          .set({ sfStatus: "超過なし", updatedAt: now })
          .where(eq(mobileUsages.id, usage.id));
        results.success++;
        continue;
      }

      try {
        await sendToSF(conn, usage, tenant);
        await db.update(mobileUsages)
          .set({ sfStatus: "送信済", sfSentAt: now, sfErrorMessage: null, updatedAt: now })
          .where(eq(mobileUsages.id, usage.id));
        results.success++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "不明なエラー";
        await db.update(mobileUsages)
          .set({ sfStatus: "エラー", sfErrorMessage: msg, updatedAt: now })
          .where(eq(mobileUsages.id, usage.id));
        results.errors.push(`${tenant.companyName}: ${msg}`);
      }
    }

    await logActivity({
      actionType: "sf_send",
      message: `携帯回線SF送信完了: 成功${results.success}件、エラー${results.errors.length}件`,
      targetTable: "mobile_usages",
      afterJson: results,
    });

    return NextResponse.json(results);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("Mobile SF send error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}