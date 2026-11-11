import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conciergeDiffs, mobileLines } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/audit";
import { runInTransaction } from "@/lib/db/tx";
import { phoneMatchKey } from "@/lib/phone";
import { requireRole } from "@/lib/api-auth";

/**
 * IMEI / ICCID の入力値を整える。
 * - undefined … 送られてこなかった（＝既存値を変えない）
 * - null      … 空欄（＝消す）
 * 桁数の基準はCSV一括登録・コンシェル同期（validateIdentifiers）と同じ。
 * 画面からの手入力なので、桁数が合わないときは黙って空にせずエラーで返す。
 */
function parseIdentifier(
  raw: unknown,
  kind: "imei" | "iccid"
): { ok: true; value: string | null | undefined } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, value: undefined };
  const v = String(raw ?? "").replace(/[\s-]/g, "").trim();
  if (v === "") return { ok: true, value: null };
  if (kind === "imei" && !/^\d{15}$/.test(v)) {
    return { ok: false, error: `IMEIは15桁の数字で入力してください（入力値: ${v}）` };
  }
  if (kind === "iccid" && !/^\d{19,20}$/.test(v)) {
    return { ok: false, error: `ICCIDは19〜20桁の数字で入力してください（入力値: ${v}）` };
  }
  return { ok: true, value: v };
}

export async function POST(req: NextRequest) {
  const guard = await requireRole(["admin", "leader"]);
  if (!guard.ok) return guard.response;
  try {
    const body = await req.json();
    const { phoneNumber, tenantId, status, contractStart, contractEnd, deviceReturned, notes } = body;

    if (!phoneNumber || !tenantId) {
      return NextResponse.json({ error: "電話番号と取引先IDは必須です" }, { status: 400 });
    }
    const imei = parseIdentifier(body.imei, "imei");
    if (!imei.ok) return NextResponse.json({ error: imei.error }, { status: 400 });
    const iccid = parseIdentifier(body.iccid, "iccid");
    if (!iccid.ok) return NextResponse.json({ error: iccid.error }, { status: 400 });

    const now = new Date().toISOString();
    const id = randomUUID();

    await db.insert(mobileLines).values({
      id,
      phoneNumber,
      // コンシェル同期の突合キー。ここを入れ忘れると差分照合から漏れる
      phoneKey: phoneMatchKey(phoneNumber),
      tenantId,
      status: status ?? "契約中",
      contractStart: contractStart || null,
      contractEnd: contractEnd || null,
      deviceReturned: deviceReturned ?? 0,
      imei: imei.value ?? null,
      iccid: iccid.value ?? null,
      notes: notes || null,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity({
      actionType: "tenant_create",
      message: `携帯回線登録: ${phoneNumber}`,
      targetTable: "mobile_lines",
      targetId: id,
    });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("Mobile master POST error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const guard = await requireRole(["admin", "leader"]);
  if (!guard.ok) return guard.response;
  try {
    const body = await req.json();
    const { id, phoneNumber, tenantId, status, contractStart, contractEnd, deviceReturned, notes } = body;

    if (!id) {
      return NextResponse.json({ error: "IDは必須です" }, { status: 400 });
    }
    const imei = parseIdentifier(body.imei, "imei");
    if (!imei.ok) return NextResponse.json({ error: imei.error }, { status: 400 });
    const iccid = parseIdentifier(body.iccid, "iccid");
    if (!iccid.ok) return NextResponse.json({ error: iccid.error }, { status: 400 });

    const [before] = await db
      .select({ imei: mobileLines.imei, iccid: mobileLines.iccid })
      .from(mobileLines)
      .where(eq(mobileLines.id, id));
    if (!before) {
      return NextResponse.json({ error: "回線が見つかりません" }, { status: 404 });
    }

    const now = new Date().toISOString();

    // 手入力でSBの値に揃えたら、同じ内容を提案している未処理の差分は不要になる。
    // 次回の同期でも「他の経路で解消」として終了されるが、定期実行が動くまで
    // 画面に残り続けるので、ここで同じ扱いにしておく。
    const resolvedFields = [
      imei.value ? { field: "imei", value: imei.value } : null,
      iccid.value ? { field: "iccid", value: iccid.value } : null,
    ].filter((f): f is { field: string; value: string } => f !== null);
    // 台帳の更新と差分の終了は1回のコミットにまとめる（片方だけ残らないように）
    // ※ この中で runInTransaction を再度呼ばないこと（入れ子不可）
    const diffsClosed = await runInTransaction(async () => {
      await db.update(mobileLines).set({
        phoneNumber,
        phoneKey: phoneMatchKey(phoneNumber),
        tenantId,
        status,
        contractStart: contractStart || null,
        contractEnd: contractEnd || null,
        deviceReturned: deviceReturned ?? 0,
        // 送られてこなかった項目は既存値を残す（他の呼び出し元で消さないため）
        ...(imei.value !== undefined ? { imei: imei.value } : {}),
        ...(iccid.value !== undefined ? { iccid: iccid.value } : {}),
        notes: notes || null,
        updatedAt: now,
      }).where(eq(mobileLines.id, id));

      let closedCount = 0;
      for (const f of resolvedFields) {
        const closed = await db
          .update(conciergeDiffs)
          .set({ status: "superseded", note: "回線マスタの手入力で解消されたため終了", updatedAt: now })
          .where(
            and(
              eq(conciergeDiffs.mobileLineId, id),
              eq(conciergeDiffs.status, "pending"),
              eq(conciergeDiffs.direction, "inbound"),
              eq(conciergeDiffs.field, f.field),
              eq(conciergeDiffs.afterValue, f.value),
              inArray(conciergeDiffs.diffType, ["imei_changed", "iccid_changed"])
            )
          )
          .returning({ id: conciergeDiffs.id });
        closedCount += closed.length;
      }
      return closedCount;
    });

    // 操作ログは失敗しても握りつぶされるので、変更前後を本文に残しておく
    const idChanges = [
      imei.value !== undefined && imei.value !== before.imei
        ? `IMEI ${before.imei ?? "空"} → ${imei.value ?? "空"}`
        : null,
      iccid.value !== undefined && iccid.value !== before.iccid
        ? `ICCID ${before.iccid ?? "空"} → ${iccid.value ?? "空"}`
        : null,
    ].filter(Boolean);

    await logActivity({
      actionType: "tenant_update",
      message:
        `携帯回線更新: ${phoneNumber}` +
        (idChanges.length ? `（${idChanges.join("、")}）` : "") +
        (diffsClosed ? `／コンシェル差分${diffsClosed}件を終了` : ""),
      targetTable: "mobile_lines",
      targetId: id,
    });

    return NextResponse.json({ success: true, diffsClosed });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("Mobile master PUT error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireRole(["admin", "leader"]);
  if (!guard.ok) return guard.response;
  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "IDは必須です" }, { status: 400 });
    }

    await db.delete(mobileLines).where(eq(mobileLines.id, id));

    await logActivity({
      actionType: "tenant_update",
      message: `携帯回線削除`,
      targetTable: "mobile_lines",
      targetId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("Mobile master DELETE error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}