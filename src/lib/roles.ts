/**
 * ロールの判定をここに集約する。
 * サーバー（ページ / API）とクライアント（サイドバー・ボタン）の両方から使うため、
 * server-only は付けない。
 */
export type Role = "admin" | "leader" | "member" | "viewer";

function isLeaderOrAbove(role?: string | null): boolean {
  return role === "admin" || role === "leader";
}

/** 請求を動かす操作（SF反映・インポート・再計算・タリフ・回線マスタ編集・未照合の紐付け） */
export function canManageBilling(role?: string | null): boolean {
  return isLeaderOrAbove(role);
}

/** ダッシュボード。member は請求の内訳を見るのが仕事なので入口は取引先一覧にする */
export function canViewDashboard(role?: string | null): boolean {
  return isLeaderOrAbove(role);
}

/** 設定画面（ユーザー一覧・自分のSF連携・SF接続情報） */
export function canViewSettings(role?: string | null): boolean {
  return isLeaderOrAbove(role);
}

/** 更新履歴を全ユーザー分見られるか。member は自分の操作だけ */
export function canViewAllActivity(role?: string | null): boolean {
  return isLeaderOrAbove(role);
}

/** 日常のデータ整備（取引先の登録更新・アクション管理） */
export function canEditData(role?: string | null): boolean {
  return role === "admin" || role === "leader" || role === "member";
}

/** IP回線マスタの「編集」だけは member にも開ける（新規登録・削除・CSV登録は leader 以上） */
export function canEditIpMaster(role?: string | null): boolean {
  return canEditData(role);
}

/** ユーザーの追加・編集・削除、取引先の削除 */
export function canManageUsers(role?: string | null): boolean {
  return isLeaderOrAbove(role);
}

/** SF接続解除・SF UserID の手動設定 */
export function isAdmin(role?: string | null): boolean {
  return role === "admin";
}

/** ロールに応じたログイン後の入口 */
export function landingPathFor(role?: string | null): string {
  return canViewDashboard(role) ? "/dashboard" : "/tenants";
}
