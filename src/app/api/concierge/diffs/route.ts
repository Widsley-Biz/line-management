import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, eq, inArray, like, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { conciergeDiffs, conciergeLines, mobileLines } from "@/lib/db/schema";
import { runInTransaction } from "@/lib/db/tx";
import { logActivity } from "@/lib/audit";
import { requireRole } from "@/lib/api-auth";
import { phoneMatchKey } from "@/lib/phone";
import { DIFF_TYPE_LABELS } from "@/lib/concierge/labels";

/**
 * 差分の承認・却下。
 *
 * ★このルートだけが mobile_lines（台帳）を更新できる（INV-2）。
 *   同期処理は差分テーブルにしか書かない。
 *
 * inbound（SBが正）… 承認したその場で台帳へ反映し applied にする
 * outbound（氏名欄）… 承認は approved まで。コンシェルへの書き込みは Phase D
 */

/**
 * 1リクエストで扱う上限。
 * 書き込みは1トランザクション＝GCS同期1回にまとめるので件数が多くても
 * 同期回数は増えないが、リクエストタイムアウト（300秒）に対する歯止めとして置く。
 */
const MAX_BULK = 4000;

type Action = "approve" | "reject";

type Body = {
  action: Action;
  ids: string[];
  /** line_added を承認するとき、どの取引先の回線として登録するか */
  tenantId?: string;
  /** 却下の理由（任意） */
  note?: string;
};

export async function PATCH(req: NextRequest) {
  const guard = await requireRole(["admin", "leader"]);
  if (!guard.ok) return guard.response;
  const userId = guard.session.user.id;

  try {
    const body = (await req.json()) as Body;
    const { action, ids, tenantId, note } = body;

    if (!action || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "操作と対象の指定が必要です" },
        { status: 400 }
      );
    }
    if (ids.length > MAX_BULK) {
      return NextResponse.json(
        { error: `一度に処理できるのは${MAX_BULK}件までです（${ids.length}件が指定されました）` },
        { status: 400 }
      );
    }

    const targets = await db
      .select()
      .from(conciergeDiffs)
      .where(inArray(conciergeDiffs.id, ids));

    const open = targets.filter(
      (t) => t.status === "pending" || t.status === "approved"
    );
    const skipped = targets.length - open.length;

    if (open.length === 0) {
      return NextResponse.json({
        success: 0,
        skipped,
        errors: ["対象がすでに処理済みです"],
      });
    }

    const now = new Date().toISOString();
    const errors: string[] = [];
    let success = 0;

    // 書き込みは1トランザクションにまとめる。
    // GCSマウント上のSQLiteは個別コミットごとにネットワーク同期が走るため。
    // ※ この中で runInTransaction を再度呼ばないこと（入れ子不可）
    await runInTransaction(async () => {
      for (const d of open) {
        try {
          if (action === "reject") {
            await db
              .update(conciergeDiffs)
              .set({
                status: "rejected",
                reviewedByUserId: userId,
                reviewedAt: now,
                note: note ?? null,
                updatedAt: now,
              })
              .where(eq(conciergeDiffs.id, d.id));
            success++;
            continue;
          }

          // ── outbound（氏名欄をコンシェルへ書く）は承認どまり ──
          if (d.direction === "outbound") {
            await db
              .update(conciergeDiffs)
              .set({
                status: "approved",
                reviewedByUserId: userId,
                reviewedAt: now,
                updatedAt: now,
              })
              .where(eq(conciergeDiffs.id, d.id));
            success++;
            continue;
          }

          // ── inbound（SBが正）は台帳へ即反映 ──
          if (d.diffType === "line_added") {
            if (!tenantId) {
              errors.push(`${d.phoneNumber}: 提供先が選択されていません`);
              continue;
            }
            const payload = d.payloadJson
              ? (JSON.parse(d.payloadJson) as {
                  contactName?: string | null;
                  imei?: string | null;
                  iccid?: string | null;
                })
              : {};
            const lineId = randomUUID();
            await db.insert(mobileLines).values({
              id: lineId,
              tenantId,
              phoneNumber: d.phoneNumber,
              phoneKey: d.phoneKey,
              status: "契約中",
              imei: payload.imei ?? null,
              iccid: payload.iccid ?? null,
              conciergeName: payload.contactName ?? null,
              conciergeStatus: "一致",
              conciergeSyncedAt: now,
              createdAt: now,
              updatedAt: now,
            });
            await db
              .update(conciergeDiffs)
              .set({
                status: "applied",
                mobileLineId: lineId,
                tenantId,
                reviewedByUserId: userId,
                reviewedAt: now,
                appliedAt: now,
                updatedAt: now,
              })
              .where(eq(conciergeDiffs.id, d.id));
            success++;
            continue;
          }

          if (!d.mobileLineId) {
            errors.push(`${d.phoneNumber}: 対象の回線が特定できません`);
            continue;
          }

          const patch: Partial<typeof mobileLines.$inferInsert> = {
            conciergeSyncedAt: now,
            updatedAt: now,
          };
          switch (d.diffType) {
            case "imei_changed":
              patch.imei = d.afterValue;
              break;
            case "iccid_changed":
              patch.iccid = d.afterValue;
              break;
            case "number_changed":
              patch.phoneNumber = d.afterValue ?? d.phoneNumber;
              patch.phoneKey = phoneMatchKey(d.afterValue ?? d.phoneNumber);
              break;
            case "line_removed":
              patch.status = "解約済";
              patch.contractEnd = now.slice(0, 10);
              break;
            default:
              errors.push(`${d.phoneNumber}: 未対応の差分種別（${d.diffType}）`);
              continue;
          }

          await db
            .update(mobileLines)
            .set(patch)
            .where(eq(mobileLines.id, d.mobileLineId));
          await db
            .update(conciergeDiffs)
            .set({
              status: "applied",
              reviewedByUserId: userId,
              reviewedAt: now,
              appliedAt: now,
              updatedAt: now,
            })
            .where(eq(conciergeDiffs.id, d.id));
          success++;
        } catch (e) {
          // 1件ずつ try/catch し、失敗しても次へ進む（send-sf と同じ方針）
          const msg = e instanceof Error ? e.message : "不明なエラー";
          errors.push(`${d.phoneNumber}: ${msg}`);
          await db
            .update(conciergeDiffs)
            .set({ status: "failed", errorMessage: msg, updatedAt: now })
            .where(eq(conciergeDiffs.id, d.id))
            .catch(() => undefined);
        }
      }
    });

    const typeSummary = [...new Set(open.map((d) => DIFF_TYPE_LABELS[d.diffType] ?? d.diffType))].join("、");
    await logActivity({
      actionType: action === "approve" ? "concierge_approve" : "concierge_reject",
      message: `コンシェル差分を${action === "approve" ? "承認" : "却下"}: ${success}件（${typeSummary}）`,
      targetTable: "concierge_diffs",
      afterJson: {
        action,
        success,
        skipped,
        errors,
        // 巻き戻しに使えるよう、変更前後を残す
        changes: open.map((d) => ({
          phoneNumber: d.phoneNumber,
          diffType: d.diffType,
          before: d.beforeValue,
          after: d.afterValue,
        })),
      },
    });

    return NextResponse.json({ success, skipped, errors });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("concierge diffs PATCH error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const guard = await requireRole(["admin", "leader", "member", "viewer"]);
  if (!guard.ok) return guard.response;

  const sp = req.nextUrl.searchParams;

  // 絞り込み条件に一致する差分のIDを全件返す。
  // 3,561件を会社名で絞って一括承認する運用のため、
  // 画面の1ページ（50件）を超えて選択できるようにする。
  if (sp.get("mode") === "ids") {
    const status = sp.get("status") || "pending";
    const type = sp.get("type") || "";
    const q = (sp.get("q") || "").trim();
    const company = (sp.get("company") || "").trim();

    const conditions = [eq(conciergeDiffs.status, status as "pending")];
    // 画面側と同じく会社名は完全一致（部分一致だと別会社を巻き込む）
    if (company) conditions.push(eq(conciergeDiffs.baseConciergeValue, company));
    if (type) conditions.push(eq(conciergeDiffs.diffType, type as "line_added"));
    if (q) {
      const pattern = `%${q}%`;
      conditions.push(
        or(
          like(conciergeDiffs.phoneNumber, pattern),
          like(conciergeDiffs.beforeValue, pattern),
          like(conciergeDiffs.afterValue, pattern),
          like(conciergeDiffs.baseConciergeValue, pattern)
        )!
      );
    }

    const rows = await db
      .select({ id: conciergeDiffs.id })
      .from(conciergeDiffs)
      .where(and(...conditions))
      .limit(MAX_BULK);

    return NextResponse.json({
      ids: rows.map((r) => r.id),
      capped: rows.length === MAX_BULK,
      max: MAX_BULK,
    });
  }

  const phoneKey = sp.get("phoneKey");
  if (!phoneKey) {
    return NextResponse.json({ error: "phoneKey が必要です" }, { status: 400 });
  }

  const [mirror] = await db
    .select()
    .from(conciergeLines)
    .where(eq(conciergeLines.phoneKey, phoneKey));
  const history = await db
    .select()
    .from(conciergeDiffs)
    .where(eq(conciergeDiffs.phoneKey, phoneKey));

  return NextResponse.json({ mirror: mirror ?? null, history });
}
