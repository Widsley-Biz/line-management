// CDR取込結果の未紐付け番号と未照合レコードの対応付け・割当後の除外を確認する。
// 実行: npx tsx --test tests/cdr-unmatched-rows.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { attachUnmatchedRows, removeAssignedRows } from "../src/lib/cdr-unmatched-rows";

test("番号ごとに未照合レコードのID・利用月を付ける（利用月が複数なら複数件、利用月順）", () => {
  const numbers = new Map([
    ["0312345678", { phoneNumber: "03-1234-5678", rowCount: 3, totalSeconds: 90 }],
    ["0501111222", { phoneNumber: "050-1111-222", rowCount: 1, totalSeconds: 10 }],
  ]);
  const written = [
    { id: "b", phoneNumber: "0312345678", yearMonth: "2026-09", totalSeconds: 60 },
    { id: "a", phoneNumber: "0312345678", yearMonth: "2026-08", totalSeconds: 30 },
    { id: "c", phoneNumber: "0501111222", yearMonth: "2026-09", totalSeconds: 10 },
  ];
  const result = attachUnmatchedRows(numbers, written);
  assert.equal(result.length, 2);
  // 表示用の番号（CSVの生の表記）はそのまま残す
  assert.equal(result[0].phoneNumber, "03-1234-5678");
  assert.deepEqual(result[0].rows.map((r) => r.id), ["a", "b"]);
  assert.deepEqual(result[1].rows, [{ id: "c", yearMonth: "2026-09", totalSeconds: 10 }]);
});

test("保存レコードが見つからない番号は rows が空になる", () => {
  const numbers = new Map([["0312345678", { phoneNumber: "0312345678", rowCount: 1, totalSeconds: 5 }]]);
  const result = attachUnmatchedRows(numbers, []);
  assert.deepEqual(result[0].rows, []);
});

test("割当済みのレコードを外し、全月割当済みの番号は一覧から消える", () => {
  const results = [
    {
      fileName: "a.csv",
      unmatchedNumbers: [
        {
          phoneNumber: "0312345678",
          rowCount: 3,
          totalSeconds: 90,
          rows: [
            { id: "a", yearMonth: "2026-08", totalSeconds: 30 },
            { id: "b", yearMonth: "2026-09", totalSeconds: 60 },
          ],
        },
        { phoneNumber: "0501111222", rowCount: 1, totalSeconds: 10, rows: [{ id: "c", yearMonth: "2026-09", totalSeconds: 10 }] },
      ],
    },
  ];
  const partial = removeAssignedRows(results, ["a"]);
  assert.deepEqual(partial[0].unmatchedNumbers![0].rows!.map((r) => r.id), ["b"]);
  assert.equal(partial[0].unmatchedNumbers!.length, 2);

  const all = removeAssignedRows(partial, ["b"]);
  assert.deepEqual(all[0].unmatchedNumbers!.map((u) => u.phoneNumber), ["0501111222"]);
  // 元の配列は変更しない
  assert.equal(results[0].unmatchedNumbers.length, 2);
  assert.equal(results[0].unmatchedNumbers[0].rows.length, 2);
});

test("同じレコードが複数ファイルの結果に出ていれば、どちらからも外れる", () => {
  const entry = { phoneNumber: "0312345678", rowCount: 1, totalSeconds: 5, rows: [{ id: "x", yearMonth: "2026-09", totalSeconds: 5 }] };
  const results = [
    { fileName: "a.csv", unmatchedNumbers: [entry] },
    { fileName: "b.csv", unmatchedNumbers: [{ ...entry }] },
    { fileName: "c.csv" },
  ];
  const next = removeAssignedRows(results, ["x"]);
  assert.equal(next[0].unmatchedNumbers!.length, 0);
  assert.equal(next[1].unmatchedNumbers!.length, 0);
  assert.equal(next[2], results[2]);
});

test("rows を持たない（旧形式の）結果はそのまま残す", () => {
  const results = [{ unmatchedNumbers: [{ phoneNumber: "0312345678", rowCount: 1, totalSeconds: 5 }] }];
  const next = removeAssignedRows(results, ["x"]);
  assert.equal(next[0].unmatchedNumbers!.length, 1);
});
