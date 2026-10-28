// CDR取込結果の「未紐付け番号」と、保存した未照合レコード（ip_import_unmatched）を結び付ける。
// 取込結果カードから割当API（PATCH /api/ip/unmatched）を呼ぶにはレコードIDが要るため。
// DBに依存しない純粋な関数だけを置く（画面側とテストからも読み込むため）。

/** 未照合レコード1件（番号×利用月で1行） */
export type UnmatchedRowRef = {
  id: string;
  yearMonth: string;
  totalSeconds: number;
};

/** 取込結果に載る未紐付け番号（ファイル内の利用月をまたいで番号ごとに1件） */
export type UnmatchedNumberWithRows = {
  phoneNumber: string;
  rowCount: number;
  totalSeconds: number;
  /** この番号の未照合レコード。利用月が複数あれば複数件 */
  rows?: UnmatchedRowRef[];
};

/**
 * 番号ごとの未紐付け集計に、保存した未照合レコードのID・利用月を付ける。
 * - `numbers` のキーと `written[].phoneNumber` はどちらも正規化済みの番号
 * - 既存のpendingレコードに加算マージした場合は、そのレコードのIDが入る（新規IDは作らない）
 */
export function attachUnmatchedRows<T extends { phoneNumber: string; rowCount: number; totalSeconds: number }>(
  numbers: Map<string, T>,
  written: { id: string; phoneNumber: string; yearMonth: string; totalSeconds: number }[]
): (T & { rows: UnmatchedRowRef[] })[] {
  const byNumber = new Map<string, UnmatchedRowRef[]>();
  for (const w of written) {
    const list = byNumber.get(w.phoneNumber) ?? [];
    list.push({ id: w.id, yearMonth: w.yearMonth, totalSeconds: w.totalSeconds });
    byNumber.set(w.phoneNumber, list);
  }
  return Array.from(numbers.entries()).map(([normalized, n]) => ({
    ...n,
    rows: (byNumber.get(normalized) ?? []).sort((a, b) => a.yearMonth.localeCompare(b.yearMonth)),
  }));
}

/**
 * 割当が済んだ未照合レコードを取込結果から外す。
 * 同じ番号が複数ファイルに出ていても（同一レコードにマージされるため）すべてのファイルから外れる。
 * レコードが残らなくなった番号は一覧から消す。
 */
export function removeAssignedRows<R extends { unmatchedNumbers?: UnmatchedNumberWithRows[] }>(
  results: R[],
  assignedIds: Iterable<string>
): R[] {
  const done = new Set(assignedIds);
  if (done.size === 0) return results;
  return results.map((r) => {
    if (!r.unmatchedNumbers) return r;
    const next: UnmatchedNumberWithRows[] = [];
    for (const u of r.unmatchedNumbers) {
      if (!u.rows) {
        next.push(u);
        continue;
      }
      const remaining = u.rows.filter((row) => !done.has(row.id));
      if (remaining.length === u.rows.length) next.push(u);
      else if (remaining.length > 0) next.push({ ...u, rows: remaining });
    }
    return { ...r, unmatchedNumbers: next };
  });
}
