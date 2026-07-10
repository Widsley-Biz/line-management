import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ipNumbers, tenants } from "@/lib/db/schema";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/audit";
import { normalizePhoneNumber } from "@/lib/ip-billing";

function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let inQuote = false;
  let current = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      cols.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cols.push(current);
  return cols;
}

// CSVフォーマット: 電話番号,裏番号,会社名,ステータス,備考
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "ファイルが選択されていません" }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.replace(/^﻿/, "").split("\n").filter((l) => l.trim());
    if (lines.length < 2) {
      return NextResponse.json({ error: "データ行がありません" }, { status: 400 });
    }

    const allTenants = await db
      .select({ id: tenants.id, companyName: tenants.companyName })
      .from(tenants);
    const tenantMap = new Map(allTenants.map((t) => [t.companyName.trim(), t.id]));

    const existingRows = await db
      .select({ phoneNumber: ipNumbers.phoneNumber })
      .from(ipNumbers);
    const existingPhones = new Set(
      existingRows.map((l) => normalizePhoneNumber(l.phoneNumber))
    );

    const now = new Date().toISOString();
    let inserted = 0;
    let skipped = 0;
    const unmatchedTenants: string[] = [];
    const duplicatePhones: string[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      if (cols.length < 3) continue;

      const phoneNumber = normalizePhoneNumber(cols[0] ?? "");
      const subNumber = normalizePhoneNumber(cols[1] ?? "") || null;
      const companyName = cols[2]?.trim() ?? "";
      const status = (cols[3]?.trim() || "契約中") as "契約中" | "解約済";
      const notes = cols[4]?.trim() || null;

      if (!phoneNumber || !companyName) {
        errors.push(`行${i + 1}: 電話番号または会社名が空です`);
        skipped++;
        continue;
      }

      const tenantId = tenantMap.get(companyName);
      if (!tenantId) {
        unmatchedTenants.push(companyName);
        skipped++;
        continue;
      }

      if (existingPhones.has(phoneNumber)) {
        duplicatePhones.push(phoneNumber);
        skipped++;
        continue;
      }

      await db.insert(ipNumbers).values({
        id: randomUUID(),
        phoneNumber,
        subNumber,
        tenantId,
        status,
        notes,
        createdAt: now,
        updatedAt: now,
      });

      existingPhones.add(phoneNumber);
      inserted++;
    }

    await logActivity({
      actionType: "import",
      message: `IP番号マスタ一括インポート: 登録${inserted}件、スキップ${skipped}件`,
      afterJson: { inserted, skipped, unmatchedTenants, duplicatePhones },
    });

    return NextResponse.json({
      inserted,
      skipped,
      unmatchedTenants: [...new Set(unmatchedTenants)],
      duplicatePhones,
      errors,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("IP master import error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
