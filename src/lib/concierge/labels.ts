/**
 * 差分の種別・状態の日本語ラベル。
 * サーバー（通知文面）とクライアント（一覧表示）の両方から使うので server-only は付けない。
 */

export const DIFF_TYPE_LABELS: Record<string, string> = {
  line_added: "新規開通",
  line_removed: "解約",
  number_changed: "番号変更",
  imei_changed: "端末交換",
  iccid_changed: "SIM再発行",
  name_mismatch: "氏名欄の不一致",
};

/** 何が起きたのか・何をすべきかを1行で示す補足 */
export const DIFF_TYPE_HINTS: Record<string, string> = {
  line_added: "SBにあって台帳にない回線です。提供先を選んで台帳に登録します",
  line_removed: "台帳にあってSBにない回線です。解約済にします",
  number_changed: "ICCIDが同じで番号が変わりました。台帳の番号を更新し、氏名欄も登録し直します",
  imei_changed: "端末が変わりました（故障・紛失による交換）。台帳のIMEIをSBに合わせます",
  iccid_changed: "SIMが変わりました（再発行）。台帳のICCIDをSBに合わせます",
  name_mismatch: "コンシェルの氏名欄が提供先の会社名と違います。コンシェル側を直します",
};

export const DIFF_STATUS_LABELS: Record<string, string> = {
  pending: "未承認",
  approved: "承認済（反映待ち）",
  applied: "反映済",
  failed: "反映失敗",
  rejected: "却下",
  superseded: "終了",
};

export const DIRECTION_LABELS: Record<string, string> = {
  inbound: "SB → 台帳",
  outbound: "台帳 → SB",
};

export const RUN_STATUS_LABELS: Record<string, string> = {
  queued: "待機中",
  running: "実行中",
  succeeded: "成功",
  partial: "一部成功",
  failed: "失敗",
  timeout: "タイムアウト",
};

export const RUN_TYPE_LABELS: Record<string, string> = {
  probe: "調査",
  read: "読み取り",
  write: "書き込み",
  billing_csv: "請求ファイル",
};
