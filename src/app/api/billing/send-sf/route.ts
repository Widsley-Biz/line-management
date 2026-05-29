import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { monthlyUsages, tenants, auditLogs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import jsforce from "jsforce";

export async function POST(req: NextRequest) {
  try {
    const { tenantId, yearMonth } = await req.json();

    if (!tenantId || !yearMonth) {
      return NextResponse.json({ error: "tenantId と yearMonth は必須です" }, { status: 400 });
    }

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      return NextResponse.json({ error: "取引先が見つかりません" }, { status: 404 });
    }

    if (!tenant.sfOpportunityId) {
      return NextResponse.json({ error: "SF商談IDが設定されていません" }, { status: 400 });
    }

    const [usage] = await db
      .select()
      .from(monthlyUsages)
      .where(
        and(
          eq(monthlyUsages.tenantId, tenantId),
          eq(monthlyUsages.yearMonth, yearMonth)
        )
      )
      .limit(1);

    if (!usage) {
      return NextResponse.json({ error: "請求データが見つかりません" }, { status: 404 });
    }

    if (usage.sfStatus === "送信済") {
      return NextResponse.json({ message: "既に送信済みです" });
    }

    if (usage.overageCharge <= 0) {
      await db
        .update(monthlyUsages)
        .set({ sfStatus: "超過なし", updatedAt: new Date().toISOString() })
        .where(eq(monthlyUsages.id, usage.id));
      return NextResponse.json({ message: "超過料金なし" });
    }

    // Connect to Salesforce
    const conn = new jsforce.Connection({
      loginUrl: process.env.SF_LOGIN_URL ?? "https://login.salesforce.com",
    });

    await conn.login(
      process.env.SF_USERNAME!,
      (process.env.SF_PASSWORD ?? "") + (process.env.SF_SECURITY_TOKEN ?? "")
    );

    const now = new Date().toISOString();

    // 開始日: 月初日、終了日: 月末日
    const [ymYear, ymMonth] = yearMonth.split("-").map(Number);
    const startDate = `${yearMonth}-01`;
    const lastDayNum = new Date(ymYear, ymMonth, 0).getDate();
    const endDate = `${yearMonth}-${String(lastDayNum).padStart(2, "0")}`;

    const lineItems: object[] = [];

    if (usage.overageFixed > 0) {
      lineItems.push({
        OpportunityId: tenant.sfOpportunityId,
        Product2Id: process.env.SF_PRODUCT2_ID_CC01,
        UnitPrice: Math.round(usage.overageFixed),
        Quantity: 1,
        Billing_start_date__c: startDate,
        billing_end_date__c: endDate,
        Description: `IP通話超過料金（固定宛）${yearMonth}月分`,
      });
    }

    if (usage.overageMobile > 0) {
      lineItems.push({
        OpportunityId: tenant.sfOpportunityId,
        Product2Id: process.env.SF_PRODUCT2_ID_CC02,
        UnitPrice: Math.round(usage.overageMobile),
        Quantity: 1,
        Billing_start_date__c: startDate,
        billing_end_date__c: endDate,
        Description: `IP通話超過料金（携帯宛）${yearMonth}月分`,
      });
    }

    if (lineItems.length > 0) {
      const results = await (conn.sobject("OpportunityLineItem") as unknown as {
        create: (items: object[]) => Promise<Array<{ success: boolean; errors?: unknown[] }>>;
      }).create(lineItems);

      for (const r of results) {
        if (!r.success) {
          throw new Error(`SF送信エラー: ${JSON.stringify(r.errors)}`);
        }
      }
    }

    // Update status
    await db
      .update(monthlyUsages)
      .set({
        sfStatus: "送信済",
        sfSentAt: now,
        sfErrorMessage: null,
        updatedAt: now,
      })
      .where(eq(monthlyUsages.id, usage.id));

    // Audit log
    await db.insert(auditLogs).values({
      id: randomUUID(),
      actionType: "sf_send",
      targetTable: "monthly_usages",
      targetId: usage.id,
      afterJson: JSON.stringify({ sfStatus: "送信済", sfSentAt: now }),
      createdAt: now,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("SF send error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
