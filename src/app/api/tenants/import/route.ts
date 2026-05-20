import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/audit";

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

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "ファイルが選択されていません" }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) {
      return NextResponse.json({ error: "データ行がありません" }, { status: 400 });
    }

    // 既存のSF商談ID・slugを取得（重複チェック用）
    const existingTenants = await db
      .select({ slug: tenants.slug, sfOpportunityId: tenants.sfOpportunityId })
      .from(tenants);
    const existingSlugs = new Set(existingTenants.map((t) => t.slug));
    const existingSfIds = new Set(
      existingTenants.map((t) => t.sfOpportunityId).filter(Boolean)
    );

    const now = new Date().toISOString();
    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];
    const duplicates: string[] = [];

    // 1行目はヘッダーとしてスキップ
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const companyName = cols[0]?.trim() ?? "";
      const sfOpportunityId = cols[1]?.trim() ?? "";
      const mfPartnerId = cols[2]?.trim() || null;
      const notes = cols[3]?.trim() || null;

      // 必須チェック
      if (!companyName) {
        errors.push(`行${i + 1}: 会社名が空です`);
        skipped++;
        continue;
      }
      if (!sfOpportunityId) {
        errors.push(`行${i + 1}: SF商談IDが空です（${companyName}）`);
        skipped++;
        continue;
      }

      // SF商談ID重複チェック
      if (existingSfIds.has(sfOpportunityId)) {
        duplicates.push(`${companyName}（${sfOpportunityId}）`);
        skipped++;
        continue;
      }

      // slugはSF商談IDをそのまま使用
      const slug = sfOpportunityId;

      // slug重複チェック
      if (existingSlugs.has(slug)) {
        duplicates.push(`${companyName}（slug重複: ${slug}）`);
        skipped++;
        continue;
      }

      const id = randomUUID();
      await db.insert(tenants).values({
        id,
        slug,
        companyName,
        sfOpportunityId,
        mfPartnerId,
        assigneeId: null,
        status: "active",
        notes,
        createdAt: now,
        updatedAt: now,
      });

      existingSlugs.add(slug);
      existingSfIds.add(sfOpportunityId);
      inserted++;
    }

    await logActivity({
      actionType: "import",
      message: `テナント一括登録: 登録${inserted}件、スキップ${skipped}件`,
      afterJson: { inserted, skipped, duplicates, errors },
    });

    return NextResponse.json({ inserted, skipped, duplicates, errors });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("Tenant import error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}