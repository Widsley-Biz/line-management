import { db } from "@/lib/db";
import {
  conciergeDiffs,
  conciergeLines,
  conciergeSyncRuns,
  tenants,
} from "@/lib/db/schema";
import { and, count, desc, eq, like, or, sql } from "drizzle-orm";
import { ConciergeClient } from "./concierge-client";

const PAGE_SIZE = 50;

type SearchParams = {
  page?: string;
  status?: string;
  type?: string;
  q?: string;
  /** SBの氏名欄の「完全一致」絞り込み。会社名チップから使う */
  company?: string;
};

export default async function ConciergePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const status = sp.status || "pending";
  const type = sp.type || "";
  const q = (sp.q || "").trim();
  const company = (sp.company || "").trim();

  const conditions = [eq(conciergeDiffs.status, status as "pending")];
  if (type) conditions.push(eq(conciergeDiffs.diffType, type as "line_added"));
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(
        like(conciergeDiffs.phoneNumber, pattern),
        like(conciergeDiffs.beforeValue, pattern),
        like(conciergeDiffs.afterValue, pattern),
        // 新規開通のSB側の氏名欄（＝提供先の会社名）も検索できるようにする。
        // 3,561件を会社名で絞り込んでまとめて割り当てる運用に必要
        like(conciergeDiffs.baseConciergeValue, pattern)
      )!
    );
  }
  // 会社名は完全一致で絞る。
  // 部分一致にすると「株式会社ライ」で「株式会社ライド」まで拾ってしまい、
  // 一括割当でよその会社の回線を取り込む事故になる。
  if (company) {
    conditions.push(eq(conciergeDiffs.baseConciergeValue, company));
  }
  const where = and(...conditions);

  const [rows, totalRow, typeCounts, statusCounts, allTenants, lastRun, mirrorStat] =
    await Promise.all([
      db
        .select({
          id: conciergeDiffs.id,
          direction: conciergeDiffs.direction,
          diffType: conciergeDiffs.diffType,
          phoneKey: conciergeDiffs.phoneKey,
          phoneNumber: conciergeDiffs.phoneNumber,
          mobileLineId: conciergeDiffs.mobileLineId,
          tenantId: conciergeDiffs.tenantId,
          field: conciergeDiffs.field,
          beforeValue: conciergeDiffs.beforeValue,
          afterValue: conciergeDiffs.afterValue,
          baseConciergeValue: conciergeDiffs.baseConciergeValue,
          payloadJson: conciergeDiffs.payloadJson,
          status: conciergeDiffs.status,
          note: conciergeDiffs.note,
          errorMessage: conciergeDiffs.errorMessage,
          createdAt: conciergeDiffs.createdAt,
        })
        .from(conciergeDiffs)
        .where(where)
        .orderBy(conciergeDiffs.diffType, conciergeDiffs.phoneNumber)
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE),
      db.select({ n: count() }).from(conciergeDiffs).where(where),
      db
        .select({ diffType: conciergeDiffs.diffType, n: count() })
        .from(conciergeDiffs)
        .where(eq(conciergeDiffs.status, status as "pending"))
        .groupBy(conciergeDiffs.diffType),
      db
        .select({ status: conciergeDiffs.status, n: count() })
        .from(conciergeDiffs)
        .groupBy(conciergeDiffs.status),
      db
        .select({ id: tenants.id, companyName: tenants.companyName })
        .from(tenants)
        .orderBy(tenants.companyName),
      db
        .select()
        .from(conciergeSyncRuns)
        .orderBy(desc(conciergeSyncRuns.queuedAt))
        .limit(1),
      db
        .select({
          n: count(),
          latest: sql<string | null>`max(${conciergeLines.observedAt})`,
          source: sql<string | null>`max(${conciergeLines.source})`,
        })
        .from(conciergeLines),
    ]);

  // 新規開通は会社名（SBの氏名欄）ごとにまとめて割り当てるのが実務。
  // 件数の多い順に出して、クリックで絞り込めるようにする。
  const companyCounts =
    status === "pending"
      ? await db
          .select({ name: conciergeDiffs.baseConciergeValue, n: count() })
          .from(conciergeDiffs)
          .where(
            and(
              eq(conciergeDiffs.status, "pending"),
              eq(conciergeDiffs.diffType, "line_added")
            )
          )
          .groupBy(conciergeDiffs.baseConciergeValue)
          .orderBy(desc(count()))
          .limit(30)
      : [];

  // 「新規開通」は氏名欄に提供先の会社名が入っているので、
  // 取引先名と完全一致するものを既定の割当先として提案する。
  // （請求取込が氏名→取引先の完全一致で照合しているのと同じ規則）
  const tenantByName = new Map(
    allTenants.map((t) => [t.companyName.trim(), t.id])
  );
  const enriched = rows.map((r) => {
    let contactName: string | null = null;
    let imei: string | null = null;
    let iccid: string | null = null;
    if (r.payloadJson) {
      try {
        const p = JSON.parse(r.payloadJson) as Record<string, string | null>;
        contactName = p.contactName ?? null;
        imei = p.imei ?? null;
        iccid = p.iccid ?? null;
      } catch {
        // 壊れたJSONで画面ごと落とさない
      }
    }
    return {
      ...r,
      contactName,
      imei,
      iccid,
      suggestedTenantId: contactName
        ? tenantByName.get(contactName.trim()) ?? null
        : null,
    };
  });

  return (
    <ConciergeClient
      rows={enriched}
      tenants={allTenants}
      total={totalRow[0]?.n ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      filters={{ status, type, q, company }}
      typeCounts={Object.fromEntries(typeCounts.map((t) => [t.diffType, t.n]))}
      statusCounts={Object.fromEntries(statusCounts.map((s) => [s.status, s.n]))}
      companyCounts={companyCounts
        .filter((c) => c.name)
        .map((c) => ({ name: c.name as string, n: c.n }))}
      lastRun={lastRun[0] ?? null}
      mirror={{
        count: mirrorStat[0]?.n ?? 0,
        observedAt: mirrorStat[0]?.latest ?? null,
        source: mirrorStat[0]?.source ?? null,
      }}
    />
  );
}
