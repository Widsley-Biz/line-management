import "server-only";
import { randomUUID } from "crypto";
import { eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  mobileLines,
  tenants,
  conciergeLines,
  conciergeDiffs,
} from "@/lib/db/schema";
import {
  computeDiffs,
  type ObservedLine,
  type MasterLine,
  type MirrorLine,
  type OpenDiff,
} from "@/lib/concierge/diff";

/**
 * 観測結果（請求CSV or コンシェル）を取り込み、差分を生成する。
 *
 * ★INV-2: この関数は mobile_lines を一切更新しない。
 *   書けるのは concierge_lines と concierge_diffs だけ。
 *   台帳を触れるのは承認API（src/app/api/concierge/diffs）のみ。
 *
 * ★呼び出し側が runInTransaction() で囲むこと。
 *   この関数の中では呼ばない（src/lib/db/tx.ts のトランザクションは入れ子にできない）。
 */

export type IngestSummary = {
  linesSeen: number;
  mirrorInserted: number;
  mirrorUpdated: number;
  mirrorSkippedStale: number;
  diffsCreated: number;
  diffsSuperseded: number;
  diffsKept: number;
  byType: Record<string, number>;
};

/** SQLiteのバインド変数上限に余裕を持たせる。列数×行数がパラメータ数になる */
const INSERT_CHUNK = 200;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function ingestObservedLines(params: {
  runId: string;
  source: "billing_csv" | "concierge";
  /** CSVなら年月（例 2026-07）、Playwrightなら runId */
  sourceRef: string;
  /** いつ時点の観測か。古い観測で新しい観測を上書きしないための判定に使う */
  observedAt: string;
  lines: ObservedLine[];
  /** 全回線の一覧を取得した場合のみ true。請求CSVは断面なので false */
  detectRemovals: boolean;
}): Promise<IngestSummary> {
  const { runId, source, sourceRef, observedAt, lines, detectRemovals } = params;
  const now = new Date().toISOString();

  // ── 突合に必要なものを読み出す ──
  const masterRows = await db
    .select({
      id: mobileLines.id,
      phoneKey: mobileLines.phoneKey,
      phoneNumber: mobileLines.phoneNumber,
      tenantId: mobileLines.tenantId,
      tenantName: tenants.companyName,
      imei: mobileLines.imei,
      iccid: mobileLines.iccid,
      status: mobileLines.status,
    })
    .from(mobileLines)
    .innerJoin(tenants, eq(mobileLines.tenantId, tenants.id));

  const master: MasterLine[] = masterRows.map((r) => ({
    ...r,
    // 0012 以前に作られた行で phone_key が NULL のまま残っていても突合できるようにする
    phoneKey: r.phoneKey ?? "",
  }));

  const mirrorRows = await db
    .select({
      id: conciergeLines.id,
      phoneKey: conciergeLines.phoneKey,
      phoneNumber: conciergeLines.phoneNumber,
      iccid: conciergeLines.iccid,
      observedAt: conciergeLines.observedAt,
      contactName: conciergeLines.contactName,
      imei: conciergeLines.imei,
    })
    .from(conciergeLines);

  const previous: MirrorLine[] = mirrorRows.map((r) => ({
    phoneKey: r.phoneKey,
    phoneNumber: r.phoneNumber,
    iccid: r.iccid,
  }));
  const mirrorByKey = new Map(mirrorRows.map((r) => [r.phoneKey, r]));

  const openRows = await db
    .select({
      id: conciergeDiffs.id,
      direction: conciergeDiffs.direction,
      diffType: conciergeDiffs.diffType,
      phoneKey: conciergeDiffs.phoneKey,
      field: conciergeDiffs.field,
      afterValue: conciergeDiffs.afterValue,
    })
    .from(conciergeDiffs)
    .where(
      or(
        eq(conciergeDiffs.status, "pending"),
        eq(conciergeDiffs.status, "approved")
      )
    );
  const openDiffs: OpenDiff[] = openRows;

  // ── 差分計算（純関数） ──
  const plan = computeDiffs({
    observed: lines,
    master,
    previous,
    openDiffs,
    detectRemovals,
  });

  // ── ミラーの更新 ──
  const toInsert: (typeof conciergeLines.$inferInsert)[] = [];
  const toUpdate: { id: string; values: Partial<typeof conciergeLines.$inferInsert> }[] = [];
  let mirrorSkippedStale = 0;

  for (const o of lines) {
    const existing = mirrorByKey.get(o.phoneKey);
    const values = {
      phoneNumber: o.phoneRaw,
      contactName: o.contactName,
      imei: o.imei,
      iccid: o.iccid,
      deptCode: o.deptCode,
      deptName: o.deptName,
      planName: o.planName,
      lineStatus: o.lineStatus,
      source,
      sourceRef,
      observedAt,
      rawJson: JSON.stringify(o.raw),
      lastSeenAt: now,
      lastSeenRunId: runId,
      disappearedAt: null,
      updatedAt: now,
    };

    if (!existing) {
      toInsert.push({
        id: randomUUID(),
        phoneKey: o.phoneKey,
        firstSeenAt: now,
        createdAt: now,
        ...values,
      });
      continue;
    }

    // 古い観測で新しい観測を上書きしない（月次CSVを後から入れ直しても日次の値を壊さない）
    if (existing.observedAt > observedAt) {
      mirrorSkippedStale++;
      continue;
    }

    // 中身が変わっていなければ書かない。GCSマウント上のSQLiteでは書き込み回数がそのまま時間になる
    const unchanged =
      existing.contactName === o.contactName &&
      existing.imei === o.imei &&
      existing.iccid === o.iccid &&
      existing.phoneNumber === o.phoneRaw;
    if (unchanged) {
      toUpdate.push({
        id: existing.id,
        values: { lastSeenAt: now, lastSeenRunId: runId, observedAt, updatedAt: now },
      });
      continue;
    }

    toUpdate.push({ id: existing.id, values });
  }

  for (const part of chunk(toInsert, INSERT_CHUNK)) {
    await db.insert(conciergeLines).values(part);
  }
  for (const u of toUpdate) {
    await db.update(conciergeLines).set(u.values).where(eq(conciergeLines.id, u.id));
  }

  // 全件一覧を取ったときだけ「消えた回線」に印を付ける（請求CSVでは判断できない）
  if (detectRemovals) {
    const seen = new Set(lines.map((l) => l.phoneKey));
    const gone = mirrorRows.filter((r) => !seen.has(r.phoneKey)).map((r) => r.id);
    for (const part of chunk(gone, INSERT_CHUNK)) {
      await db
        .update(conciergeLines)
        .set({ disappearedAt: now, updatedAt: now })
        .where(inArray(conciergeLines.id, part));
    }
  }

  // ── 既存差分の終端化 ──
  for (const part of chunk(plan.supersede, INSERT_CHUNK)) {
    for (const s of part) {
      await db
        .update(conciergeDiffs)
        .set({ status: "superseded", note: s.note, updatedAt: now })
        .where(eq(conciergeDiffs.id, s.id));
    }
  }

  // ── 新しい差分の登録 ──
  const diffInserts = plan.proposals.map((p) => ({
    id: randomUUID(),
    direction: p.direction,
    diffType: p.diffType,
    phoneKey: p.phoneKey,
    phoneNumber: p.phoneNumber,
    mobileLineId: p.mobileLineId,
    tenantId: p.tenantId,
    field: p.field,
    beforeValue: p.beforeValue,
    afterValue: p.afterValue,
    baseConciergeValue: p.baseConciergeValue,
    payloadJson: p.payload === undefined ? null : JSON.stringify(p.payload),
    status: "pending" as const,
    detectedRunId: runId,
    createdAt: now,
    updatedAt: now,
  }));

  for (const part of chunk(diffInserts, INSERT_CHUNK)) {
    await db.insert(conciergeDiffs).values(part);
  }

  const byType: Record<string, number> = {};
  for (const p of plan.proposals) byType[p.diffType] = (byType[p.diffType] ?? 0) + 1;

  return {
    linesSeen: lines.length,
    mirrorInserted: toInsert.length,
    mirrorUpdated: toUpdate.length,
    mirrorSkippedStale,
    diffsCreated: plan.proposals.length,
    diffsSuperseded: plan.supersede.length,
    diffsKept: plan.keep.length,
    byType,
  };
}
