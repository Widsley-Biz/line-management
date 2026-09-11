/**
 * SB法人コンシェル同期の差分計算。
 *
 * このファイルは意図的に「純関数だけ・DB非依存・副作用なし」に保つ。
 * テストフレームワークが未導入のため、`npx tsx` で実CSVを食わせて目視検証する
 * 唯一の足場がここになる。請求CSV経路（Phase B）とPlaywright経路（Phase C）の
 * 両方から同じ関数を呼ぶので、ここに DB や fetch を持ち込まないこと。
 */

import { phoneMatchKey } from "@/lib/phone";

export type RawCell = string | number | null | undefined;

/** コンシェル（または請求CSV）側で観測した1回線ぶんの値 */
export type ObservedLine = {
  phoneKey: string;
  phoneRaw: string;
  /** 氏名欄。運用上は提供先の会社名が入る */
  contactName: string | null;
  imei: string | null;
  iccid: string | null;
  deptCode: string | null;
  deptName: string | null;
  planName: string | null;
  lineStatus: string | null;
  /** 観測した全列。画面・CSV書式の変更に備えて丸ごと残す */
  raw: Record<string, string>;
};

/** lime側の台帳（mobile_lines）1行ぶん。突合に必要な列だけ */
export type MasterLine = {
  id: string;
  phoneKey: string;
  phoneNumber: string;
  tenantId: string;
  /** あるべき氏名＝取引先の会社名 */
  tenantName: string;
  imei: string | null;
  iccid: string | null;
  status: string;
};

/** concierge_lines に既に入っている前回の観測 */
export type MirrorLine = {
  phoneKey: string;
  phoneNumber: string;
  iccid: string | null;
};

/** 未処理（pending / approved）の差分 */
export type OpenDiff = {
  id: string;
  direction: Direction;
  diffType: DiffType;
  phoneKey: string;
  field: string | null;
  afterValue: string | null;
};

export type Direction = "inbound" | "outbound";
export type DiffType =
  | "line_added"
  | "line_removed"
  | "number_changed"
  | "imei_changed"
  | "iccid_changed"
  | "name_mismatch";

export type DiffProposal = {
  direction: Direction;
  diffType: DiffType;
  phoneKey: string;
  phoneNumber: string;
  mobileLineId: string | null;
  tenantId: string | null;
  field: string | null;
  /** 現在値（inboundならlime側、outboundならコンシェル側） */
  beforeValue: string | null;
  /** 提案値 */
  afterValue: string | null;
  /** 提案時点のコンシェル値。outbound の書き込み直前の競合検知に使う */
  baseConciergeValue: string | null;
  payload?: unknown;
};

export type DiffPlan = {
  proposals: DiffProposal[];
  /** 既存の未処理差分のうち終端にすべきもの */
  supersede: { id: string; note: string }[];
  /** 提案値が変わっていないので据え置く既存差分のid（毎朝リセットしないため） */
  keep: string[];
};

// ============================================================
// 値の検証
// ============================================================

/**
 * 請求CSVはExcelを経由すると IMEI が `3.57E+14` のように指数表記へ丸められる。
 * 実際に docs/SB超過代金2026_06請求（26_04利用分）…csv がその状態で、
 * 一方 docs/billing_priceitem (44).csv は15桁が無傷だった。
 * 壊れた値を台帳に入れてしまうと後から見分けがつかないので、ここで捨てる。
 */
export function validateIdentifiers(line: ObservedLine): {
  line: ObservedLine;
  warnings: string[];
} {
  const warnings: string[] = [];
  let imei = line.imei;
  let iccid = line.iccid;

  if (imei !== null && !/^\d{15}$/.test(imei)) {
    warnings.push(`${line.phoneRaw}: IMEIの形式が不正なため取り込みません（${imei}）`);
    imei = null;
  }
  if (iccid !== null && !/^\d{19,20}$/.test(iccid)) {
    warnings.push(`${line.phoneRaw}: ICCIDの形式が不正なため取り込みません（${iccid}）`);
    iccid = null;
  }

  return { line: { ...line, imei, iccid }, warnings };
}

// ============================================================
// SoftBank請求ファイルのメタデータ列の解釈
// ============================================================

const COL_KEYWORDS = {
  phone: ["電話番号", "携帯番号", "ご利用番号"],
  iccid: ["ICCID"],
  imei: ["製造番号", "IMEI"],
  contactName: ["氏名", "利用者", "契約者", "お名前", "ご利用者", "名前"],
  deptCode: ["部署コード"],
  deptName: ["部署名"],
  planName: ["料金プラン"],
} as const;

export type MetaColumns = {
  phone: number;
  iccid: number;
  imei: number;
  contactName: number;
  deptCode: number;
  deptName: number;
  planName: number;
};

const cell = (v: RawCell): string => {
  if (v === null || v === undefined) return "";
  return String(v).trim();
};

/**
 * ヘッダ行からメタデータ列の位置を検出する。
 *
 * `billingStartIdx`（課金項目が始まる列）より手前だけを走査する。
 * 「通話料　国際電話」のような課金項目名が電話番号キーワードに誤一致するのを防ぐため
 * （既存の src/app/api/billing/import/route.ts が同じ理由で同じ制限をかけている）。
 */
export function detectMetaColumns(
  headerRow: RawCell[],
  billingStartIdx = 13
): MetaColumns {
  const found: MetaColumns = {
    phone: -1,
    iccid: -1,
    imei: -1,
    contactName: -1,
    deptCode: -1,
    deptName: -1,
    planName: -1,
  };

  const limit = Math.min(headerRow.length, Math.max(billingStartIdx, 2));
  for (let i = 1; i < limit; i++) {
    const h = cell(headerRow[i]);
    if (!h) continue;
    for (const [key, keywords] of Object.entries(COL_KEYWORDS)) {
      const k = key as keyof MetaColumns;
      if (found[k] !== -1) continue;
      if (keywords.some((kw) => h.includes(kw))) found[k] = i;
    }
  }
  return found;
}

/**
 * SoftBank請求ファイルの行から回線メタデータを取り出す。
 *
 * 同じ電話番号が複数行に現れる（月内に端末交換があると機種契約番号とIMEIが異なる行が並ぶ）。
 * 後勝ちで1行に畳み、値が食い違った場合は警告に積んで人が気づけるようにする。
 */
export function parseSoftBankMetaRows(
  headerRow: RawCell[],
  dataRows: RawCell[][],
  billingStartIdx = 13
): { lines: ObservedLine[]; warnings: string[] } {
  const cols = detectMetaColumns(headerRow, billingStartIdx);
  const warnings: string[] = [];

  if (cols.phone === -1) {
    return { lines: [], warnings: ["電話番号の列が見つかりませんでした"] };
  }

  const pick = (row: RawCell[], idx: number): string | null =>
    idx === -1 ? null : cell(row[idx]) || null;

  const byKey = new Map<string, ObservedLine>();
  const imeiSeen = new Map<string, Set<string>>();

  for (const row of dataRows) {
    const phoneRaw = pick(row, cols.phone);
    if (!phoneRaw) continue;
    const phoneKey = phoneMatchKey(phoneRaw);
    if (!phoneKey) continue;

    const raw: Record<string, string> = {};
    for (let i = 1; i < Math.min(headerRow.length, billingStartIdx); i++) {
      const h = cell(headerRow[i]);
      const v = cell(row[i]);
      if (h && v) raw[h] = v;
    }

    const imei = pick(row, cols.imei);
    if (imei) {
      if (!imeiSeen.has(phoneKey)) imeiSeen.set(phoneKey, new Set());
      imeiSeen.get(phoneKey)!.add(imei);
    }

    const prev = byKey.get(phoneKey);
    // 後勝ち。ただし空欄で既存の値を潰さない
    byKey.set(phoneKey, {
      phoneKey,
      phoneRaw,
      contactName: pick(row, cols.contactName) ?? prev?.contactName ?? null,
      imei: imei ?? prev?.imei ?? null,
      iccid: pick(row, cols.iccid) ?? prev?.iccid ?? null,
      deptCode: pick(row, cols.deptCode) ?? prev?.deptCode ?? null,
      deptName: pick(row, cols.deptName) ?? prev?.deptName ?? null,
      planName: pick(row, cols.planName) ?? prev?.planName ?? null,
      lineStatus: null,
      raw: { ...(prev?.raw ?? {}), ...raw },
    });
  }

  for (const [phoneKey, imeis] of imeiSeen) {
    if (imeis.size > 1) {
      const line = byKey.get(phoneKey);
      warnings.push(
        `${line?.phoneRaw ?? phoneKey}: IMEIが複数あります（期間中の端末交換の可能性）: ${[...imeis].join(", ")}`
      );
    }
  }

  const lines: ObservedLine[] = [];
  for (const line of byKey.values()) {
    const checked = validateIdentifiers(line);
    warnings.push(...checked.warnings);
    lines.push(checked.line);
  }

  return { lines, warnings };
}

// ============================================================
// 差分計算
// ============================================================

export type ComputeDiffsInput = {
  observed: ObservedLine[];
  master: MasterLine[];
  /** 前回までの観測（concierge_lines）。番号変更の検知にICCIDで使う */
  previous: MirrorLine[];
  openDiffs: OpenDiff[];
  /**
   * 観測結果が「全回線の一覧」である場合のみ true。
   *
   * 請求CSVは課金のあった回線しか載らない断面なので、
   * 「CSVに無い＝解約」とは言えない。誤って全回線を解約済みにしないための歯止め。
   */
  detectRemovals: boolean;
};

const norm = (v: string | null | undefined): string => (v ?? "").trim();

export function computeDiffs(input: ComputeDiffsInput): DiffPlan {
  const { observed, master, previous, openDiffs, detectRemovals } = input;

  const masterByKey = new Map(master.map((m) => [m.phoneKey, m]));
  const observedByKey = new Map(observed.map((o) => [o.phoneKey, o]));
  const previousByIccid = new Map<string, MirrorLine>();
  for (const p of previous) {
    if (p.iccid) previousByIccid.set(p.iccid, p);
  }

  const proposals: DiffProposal[] = [];
  /** number_changed の旧番号として消費した phoneKey。line_removed から除外する */
  const consumedOldKeys = new Set<string>();

  const pushNameMismatch = (
    o: ObservedLine,
    m: MasterLine,
    phoneNumber: string
  ) => {
    const expected = norm(m.tenantName);
    const actual = norm(o.contactName);
    if (!expected || expected === actual) return;
    proposals.push({
      direction: "outbound",
      diffType: "name_mismatch",
      phoneKey: o.phoneKey,
      phoneNumber,
      mobileLineId: m.id,
      tenantId: m.tenantId,
      field: "contact_name",
      beforeValue: o.contactName,
      afterValue: expected,
      baseConciergeValue: o.contactName,
    });
  };

  for (const o of observed) {
    const m = masterByKey.get(o.phoneKey);

    if (m) {
      // 端末交換（故障・紛失） — SBが正
      if (o.imei && norm(o.imei) !== norm(m.imei)) {
        proposals.push({
          direction: "inbound",
          diffType: "imei_changed",
          phoneKey: o.phoneKey,
          phoneNumber: m.phoneNumber,
          mobileLineId: m.id,
          tenantId: m.tenantId,
          field: "imei",
          beforeValue: m.imei,
          afterValue: o.imei,
          baseConciergeValue: o.imei,
        });
      }
      // SIM再発行 — SBが正
      if (o.iccid && norm(o.iccid) !== norm(m.iccid)) {
        proposals.push({
          direction: "inbound",
          diffType: "iccid_changed",
          phoneKey: o.phoneKey,
          phoneNumber: m.phoneNumber,
          mobileLineId: m.id,
          tenantId: m.tenantId,
          field: "iccid",
          beforeValue: m.iccid,
          afterValue: o.iccid,
          baseConciergeValue: o.iccid,
        });
      }
      pushNameMismatch(o, m, m.phoneNumber);
      continue;
    }

    // 台帳にない番号。まず「番号変更」かどうかをICCIDで判定する。
    // ICCIDが同じ古い番号が前回の観測にあり、かつ今回消えていれば番号変更とみなす。
    const oldMirror = o.iccid ? previousByIccid.get(o.iccid) : undefined;
    const isNumberChange =
      !!oldMirror &&
      oldMirror.phoneKey !== o.phoneKey &&
      !observedByKey.has(oldMirror.phoneKey);
    const oldMaster = isNumberChange
      ? masterByKey.get(oldMirror!.phoneKey)
      : undefined;

    if (isNumberChange && oldMaster) {
      consumedOldKeys.add(oldMaster.phoneKey);
      proposals.push({
        direction: "inbound",
        diffType: "number_changed",
        phoneKey: o.phoneKey,
        phoneNumber: o.phoneRaw,
        mobileLineId: oldMaster.id,
        tenantId: oldMaster.tenantId,
        field: "phone_number",
        beforeValue: oldMaster.phoneNumber,
        afterValue: o.phoneRaw,
        baseConciergeValue: o.phoneRaw,
        payload: { oldPhoneKey: oldMaster.phoneKey, iccid: o.iccid },
      });
      // 番号が変わったら氏名欄を登録し直す必要がある。ここで連鎖生成しておかないと
      // 「番号は直したが氏名欄は前のまま」という一番起きやすい漏れを拾えない。
      pushNameMismatch(o, oldMaster, o.phoneRaw);
      continue;
    }

    // 新規開通
    proposals.push({
      direction: "inbound",
      diffType: "line_added",
      phoneKey: o.phoneKey,
      phoneNumber: o.phoneRaw,
      mobileLineId: null,
      tenantId: null,
      field: null,
      beforeValue: null,
      afterValue: o.phoneRaw,
      baseConciergeValue: o.contactName,
      payload: {
        contactName: o.contactName,
        imei: o.imei,
        iccid: o.iccid,
        deptName: o.deptName,
        planName: o.planName,
      },
    });
  }

  // 解約の検知。全件一覧を取得した場合のみ。
  if (detectRemovals) {
    for (const m of master) {
      if (m.status === "解約済") continue;
      if (observedByKey.has(m.phoneKey)) continue;
      if (consumedOldKeys.has(m.phoneKey)) continue;
      proposals.push({
        direction: "inbound",
        diffType: "line_removed",
        phoneKey: m.phoneKey,
        phoneNumber: m.phoneNumber,
        mobileLineId: m.id,
        tenantId: m.tenantId,
        field: null,
        beforeValue: m.status,
        afterValue: "解約済",
        baseConciergeValue: null,
      });
    }
  }

  // ── 既存の未処理差分との突き合わせ ──
  // 提案値が同じなら据え置く（毎朝走るたびに承認待ちの行がリセットされないように）。
  const openKey = (d: { direction: string; diffType: string; phoneKey: string; field: string | null }) =>
    `${d.direction}|${d.diffType}|${d.phoneKey}|${d.field ?? ""}`;

  const proposalByKey = new Map(proposals.map((p) => [openKey(p), p]));
  const supersede: { id: string; note: string }[] = [];
  const keep: string[] = [];
  const dropKeys = new Set<string>();

  for (const od of openDiffs) {
    const k = openKey(od);
    const p = proposalByKey.get(k);
    if (!p) {
      supersede.push({ id: od.id, note: "他の経路で解消されたため終了" });
      continue;
    }
    if (norm(od.afterValue) === norm(p.afterValue)) {
      keep.push(od.id);
      dropKeys.add(k); // 同じ内容を二重に作らない
    } else {
      supersede.push({ id: od.id, note: `提案値が変わったため差し替え（${od.afterValue} → ${p.afterValue}）` });
    }
  }

  return {
    proposals: proposals.filter((p) => !dropKeys.has(openKey(p))),
    supersede,
    keep,
  };
}
