import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ipUsages, ipUsageDetails, tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

function csvEscape(v: string | number | null | undefined): string {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// GET /api/ip/export?yearMonth=YYYY-MM&type=summary|numbers
export async function GET(req: NextRequest) {
  try {
    const yearMonth = req.nextUrl.searchParams.get("yearMonth") ?? "";
    const type = req.nextUrl.searchParams.get("type") ?? "summary";
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json({ error: "年月の形式が不正です (YYYY-MM)" }, { status: 400 });
    }

    let header: string[];
    let rows: string[][];

    if (type === "numbers") {
      const details = await db
        .select({
          phoneNumber: ipUsageDetails.phoneNumber,
          companyName: tenants.companyName,
          callCategory: ipUsageDetails.callCategory,
          callTypeName: ipUsageDetails.callTypeName,
          totalSeconds: ipUsageDetails.totalSeconds,
          sourceAmount: ipUsageDetails.sourceAmount,
          computedAmount: ipUsageDetails.computedAmount,
        })
        .from(ipUsageDetails)
        .innerJoin(tenants, eq(ipUsageDetails.tenantId, tenants.id))
        .where(eq(ipUsageDetails.yearMonth, yearMonth))
        .orderBy(tenants.companyName, ipUsageDetails.phoneNumber);

      header = ["電話番号", "会社名", "課金区分", "通話種別名称", "通話時間(秒)", "元金額", "計算後金額"];
      rows = details.map((d) => [
        d.phoneNumber,
        d.companyName,
        d.callCategory,
        d.callTypeName,
        String(d.totalSeconds),
        String(d.sourceAmount),
        String(d.computedAmount),
      ]);
    } else {
      const usages = await db
        .select({
          companyName: tenants.companyName,
          fixedAmount: ipUsages.fixedAmount,
          mobileNaviAmount: ipUsages.mobileNaviAmount,
          totalAmount: ipUsages.totalAmount,
          sfStatus: ipUsages.sfStatus,
          sfSentAt: ipUsages.sfSentAt,
        })
        .from(ipUsages)
        .innerJoin(tenants, eq(ipUsages.tenantId, tenants.id))
        .where(eq(ipUsages.yearMonth, yearMonth))
        .orderBy(tenants.companyName);

      header = ["会社名", "固定分(CC_01)", "携帯+ナビ分(CC_02)", "合計", "SFステータス", "送信日時"];
      rows = usages.map((u) => [
        u.companyName,
        String(u.fixedAmount),
        String(u.mobileNaviAmount),
        String(u.totalAmount),
        u.sfStatus,
        u.sfSentAt ?? "",
      ]);
    }

    const csv =
      "﻿" + [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ip_billing_${yearMonth}_${type}.csv"`,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("IP export error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
