/**
 * 動作確認用のダミーの回線一覧。開発環境でのみ表示する。
 *
 * 本番DBの回線マスタを読んで、そこに「コンシェル側で起きたこと」を混ぜて返す。
 * こうすると、差分が正しく出るか（IMEI変更・新規開通・解約）を実データで試せる。
 */
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { mobileLines, tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const PAGE_SIZE = 10;

export default async function MockLinesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; scenario?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { page, scenario } = await searchParams;
  const pageNo = Math.max(1, parseInt(page ?? "1", 10));

  const rows = await db
    .select({
      phoneNumber: mobileLines.phoneNumber,
      companyName: tenants.companyName,
      imei: mobileLines.imei,
      iccid: mobileLines.iccid,
      status: mobileLines.status,
    })
    .from(mobileLines)
    .innerJoin(tenants, eq(mobileLines.tenantId, tenants.id))
    .orderBy(mobileLines.phoneNumber);

  // シナリオ: 差分が出ることを確かめるための細工
  const observed = rows.map((r, i) => {
    if (scenario === "imei" && i === 0) {
      return { ...r, imei: "350000000009999" }; // 機種変更を演出
    }
    return r;
  });

  if (scenario === "removed") observed.pop(); // 解約を演出
  if (scenario === "added") {
    observed.push({
      phoneNumber: "090-0000-0001",
      companyName: "株式会社Widsley",
      imei: "350000000008888",
      iccid: "8981200000000008888",
      status: "契約中",
    });
  }

  const start = (pageNo - 1) * PAGE_SIZE;
  const slice = observed.slice(start, start + PAGE_SIZE);
  const hasNext = start + PAGE_SIZE < observed.length;

  const qs = (n: number) =>
    `/mock-concierge/lines?page=${n}${scenario ? `&scenario=${scenario}` : ""}`;

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>【ダミー】ご契約回線一覧</h1>
      <p>
        全{observed.length}件 / {pageNo}ページ目
        {scenario ? `（シナリオ: ${scenario}）` : ""}
      </p>
      <table border={1} cellPadding={6} style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>電話番号</th>
            <th>氏名</th>
            <th>製造番号</th>
            <th>ICCID</th>
            <th>回線状態</th>
          </tr>
        </thead>
        <tbody>
          {slice.map((r) => (
            <tr key={r.phoneNumber}>
              <td>{r.phoneNumber}</td>
              <td>{r.companyName}</td>
              <td>{r.imei ?? ""}</td>
              <td>{r.iccid ?? ""}</td>
              <td>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
        {pageNo > 1 && <a href={qs(pageNo - 1)}>前へ</a>}
        {hasNext && <a href={qs(pageNo + 1)}>次へ</a>}
      </div>
    </div>
  );
}
