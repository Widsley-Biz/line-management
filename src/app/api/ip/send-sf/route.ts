import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ipUsages, tenants } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import type { Connection } from "jsforce";
import { logActivity } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { getUserSFConnection } from "@/lib/sf-connection";
import { getIpBillingPeriod } from "@/lib/ip-billing";

// SF商品（OpportunityLineItem）2種
const SF_PRODUCTS = [
  {
    code: "CC_01",
    name: "IP回線通話料_国内固定番号宛",
    envKey: "SF_PRICEBOOK_ENTRY_ID_CC01",
    amountOf: (u: { fixedAmount: number }) => u.fixedAmount,
  },
  {
    code: "CC_02",
    name: "IP回線通話料_国内携帯番号宛",
    envKey: "SF_PRICEBOOK_ENTRY_ID_CC02",
    amountOf: (u: { mobileNaviAmount: number }) => u.mobileNaviAmount,
  },
] as const;

async function getSFConnection(): Promise<Connection> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("ログインが必要です");
  }
  const userConn = await getUserSFConnection(session.user.id);
  if (!userConn) {
    throw new Error("Salesforce連携が完了していません。設定画面からSalesforceと連携してください。");
  }
  return userConn;
}

async function sendToSF(
  conn: Connection,
  usage: { id: string; yearMonth: string; fixedAmount: number; mobileNaviAmount: number },
  tenant: { sfOpportunityId: string | null; companyName: string }
): Promise<void> {
  if (!tenant.sfOpportunityId) {
    throw new Error(`SF商談IDが設定されていません（${tenant.companyName}）`);
  }

  // 請求期間 = 利用月+1ヶ月の1日〜末日
  const { startDate, endDate } = getIpBillingPeriod(usage.yearMonth);
  const [usageYear, usageMonth] = usage.yearMonth.split("-").map(Number);

  const lineItems = SF_PRODUCTS
    .map((p) => ({ product: p, amount: p.amountOf(usage) }))
    .filter(({ amount }) => amount > 0)
    .map(({ product, amount }) => {
      const entryId = process.env[product.envKey];
      if (!entryId) {
        throw new Error(`環境変数 ${product.envKey} が設定されていません（${product.code}）`);
      }
      return {
        OpportunityId: tenant.sfOpportunityId,
        PricebookEntryId: entryId,
        UnitPrice: Math.round(amount),
        Quantity: 1,
        Billing_start_date__c: startDate,
        billing_end_date__c: endDate,
        Description: `${usageYear}年${usageMonth}月IP回線利用分として（${product.name}）`,
      };
    });

  if (lineItems.length === 0) {
    throw new Error("送信対象金額が0円のため送信できません");
  }

  // 商談に価格表をセット
  await (conn.sobject("Opportunity") as unknown as {
    update: (item: object) => Promise<{ success: boolean; errors?: unknown[] }>;
  }).update({
    Id: tenant.sfOpportunityId,
    Pricebook2Id: process.env.SF_PRICEBOOK2_ID,
  });

  const results = await (conn.sobject("OpportunityLineItem") as unknown as {
    create: (items: object[]) => Promise<Array<{ success: boolean; errors?: unknown[] }>>;
  }).create(lineItems);

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

    let targetUsages: typeof ipUsages.$inferSelect[] = [];

    if (usageIds && usageIds.length > 0) {
      targetUsages = await db
        .select()
        .from(ipUsages)
        .where(inArray(ipUsages.id, usageIds));
    } else if (tenantId && yearMonth) {
      targetUsages = await db
        .select()
        .from(ipUsages)
        .where(
          and(eq(ipUsages.tenantId, tenantId), eq(ipUsages.yearMonth, yearMonth))
        )
        .limit(1);
    } else {
      return NextResponse.json({ error: "パラメータが不正です" }, { status: 400 });
    }

    if (targetUsages.length === 0) {
      return NextResponse.json({ error: "対象データが見つかりません" }, { status: 404 });
    }

    const pending = targetUsages.filter(
      (u) => u.sfStatus === "未送信" || u.sfStatus === "エラー"
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
      .select({
        id: tenants.id,
        companyName: tenants.companyName,
        sfOpportunityId: tenants.sfOpportunityId,
      })
      .from(tenants)
      .where(inArray(tenants.id, tenantIds));
    const tenantMap = new Map(tenantRows.map((t) => [t.id, t]));

    const results = { success: 0, errors: [] as string[] };

    for (const usage of pending) {
      const tenant = tenantMap.get(usage.tenantId);
      if (!tenant) {
        results.errors.push(`取引先が見つかりません: ${usage.tenantId}`);
        await db.update(ipUsages)
          .set({ sfStatus: "エラー", sfErrorMessage: "取引先が見つかりません", updatedAt: now })
          .where(eq(ipUsages.id, usage.id));
        continue;
      }

      try {
        await sendToSF(conn, usage, tenant);
        await db.update(ipUsages)
          .set({ sfStatus: "送信済", sfSentAt: now, sfErrorMessage: null, updatedAt: now })
          .where(eq(ipUsages.id, usage.id));
        results.success++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "不明なエラー";
        await db.update(ipUsages)
          .set({ sfStatus: "エラー", sfErrorMessage: msg, updatedAt: now })
          .where(eq(ipUsages.id, usage.id));
        results.errors.push(`${tenant.companyName}: ${msg}`);
      }
    }

    await logActivity({
      actionType: "sf_send",
      message: `IP回線SF送信完了: 成功${results.success}件、エラー${results.errors.length}件`,
      targetTable: "ip_usages",
      afterJson: results,
    });

    return NextResponse.json(results);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("IP SF send error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
