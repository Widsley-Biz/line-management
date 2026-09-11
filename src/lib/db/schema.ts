import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
// ============================================================
// Mobile Lines（携帯回線マスタ）
// ============================================================
export const mobileLines = sqliteTable(
  "mobile_lines",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    phoneNumber: text("phone_number").notNull().unique(),
    /** 突合専用キー（phoneMatchKey の結果）。表示には使わない */
    phoneKey: text("phone_key"),
    status: text("status", { enum: ["契約中", "解約済"] })
      .notNull()
      .default("契約中"),
    contractStart: text("contract_start"),
    contractEnd: text("contract_end"),
    deviceReturned: integer("device_returned").notNull().default(0),
    notes: text("notes"),
    // ── SB法人コンシェル同期（承認された差分だけがここに反映される） ──
    /** 製造番号。SBが正 */
    imei: text("imei"),
    /** SIMのICCID。SBが正 */
    iccid: text("iccid"),
    /** コンシェル上の氏名欄の最終観測値（あるべき値は tenants.company_name） */
    conciergeName: text("concierge_name"),
    conciergeStatus: text("concierge_status", {
      enum: ["未確認", "一致", "要修正", "反映済", "エラー"],
    })
      .notNull()
      .default("未確認"),
    conciergeSyncedAt: text("concierge_synced_at"),
    conciergeErrorMessage: text("concierge_error_message"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("idx_mobile_lines_tenant").on(t.tenantId),
    index("idx_mobile_lines_phone_key").on(t.phoneKey),
  ]
);

// ============================================================
// Mobile Usages（携帯月次使用量）
// ============================================================
export const mobileUsages = sqliteTable(
  "mobile_usages",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    yearMonth: text("year_month").notNull(),
    totalLines: integer("total_lines").notNull().default(0),
    overageTotal: real("overage_total").notNull().default(0),
    sfStatus: text("sf_status", {
      enum: ["未送信", "送信済", "エラー", "超過なし", "対応不要"],
    })
      .notNull()
      .default("未送信"),
    sfSentAt: text("sf_sent_at"),
    sfErrorMessage: text("sf_error_message"),
    sfNoActionReason: text("sf_no_action_reason"),
    importedAt: text("imported_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("idx_mobile_usages_tenant_month").on(t.tenantId, t.yearMonth),
  ]
);

// ============================================================
// Mobile Usage Details（超過項目別明細）
// ============================================================
export const mobileUsageDetails = sqliteTable(
  "mobile_usage_details",
  {
    id: text("id").primaryKey(),
    mobileUsageId: text("mobile_usage_id")
      .notNull()
      .references(() => mobileUsages.id),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    phoneNumber: text("phone_number").notNull(),
    itemName: text("item_name").notNull(),
    amount: real("amount").notNull().default(0),
    yearMonth: text("year_month").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("idx_mobile_usage_details_usage").on(t.mobileUsageId),
    index("idx_mobile_usage_details_tenant").on(t.tenantId),
  ]
);
// ============================================================
// Users
// ============================================================
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role", { enum: ["admin", "leader", "member", "viewer"] })
    .notNull()
    .default("member"),
  sfUserId: text("sf_user_id"),
  sfAccessToken: text("sf_access_token"),
  sfRefreshToken: text("sf_refresh_token"),
  sfTokenExpiresAt: text("sf_token_expires_at"),
  sfInstanceUrl: text("sf_instance_url"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ============================================================
// Billing Accounts（請求アカウント）
// ※ 旧IP回線構造。ip_numbers への初期データ移行（Phase E）完了後に削除する
// ============================================================
export const billingAccounts = sqliteTable("billing_accounts", {
  id: text("id").primaryKey(),
  billingCode: text("billing_code").notNull().unique(), // D列: 請求ID（K202100009）
  name: text("name").notNull(),                         // E列: 請求アカウント名
  ipAddress: text("ip_address"),                        // C列: AD1 IPアドレス
  status: text("status", { enum: ["active", "archived"] })
    .notNull()
    .default("active"),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ============================================================
// Tenants（テナント・顧客企業）
// ============================================================
export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  companyName: text("company_name").notNull(),
  sfOpportunityId: text("sf_opportunity_id"),
  mfPartnerId: text("mf_partner_id"),
  assigneeId: text("assignee_id").references(() => users.id),
  status: text("status", { enum: ["active", "churned"] })
    .notNull()
    .default("active"),
  retentionUntil: text("retention_until"),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ============================================================
// IP Numbers（IP回線番号マスタ：表番号・裏番号）
// ============================================================
export const ipNumbers = sqliteTable(
  "ip_numbers",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    phoneNumber: text("phone_number").notNull().unique(),
    subNumber: text("sub_number"), // 裏番号（フリーダイヤル）NULL可
    status: text("status", { enum: ["契約中", "解約済"] })
      .notNull()
      .default("契約中"),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("idx_ip_numbers_tenant").on(t.tenantId)]
);

// ============================================================
// IP Tariffs（タリフ設定：tenant_id NULL = デフォルト）
// ============================================================
export const ipTariffs = sqliteTable(
  "ip_tariffs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").references(() => tenants.id), // NULL = デフォルトタリフ
    fixedRate: real("fixed_rate").notNull().default(0.06),        // ①固定 円/秒
    mobileRate: real("mobile_rate").notNull().default(0.25),      // ②携帯 円/秒
    naviSecRate: real("navi_sec_rate").notNull().default(0),    // ③ナビ秒課金 円/秒
    naviAmountRate: real("navi_amount_rate").notNull().default(10.5), // ④ナビ金額課金 倍率
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("idx_ip_tariffs_tenant").on(t.tenantId)]
);

// ============================================================
// IP Usages（IP月次通話料）
// ============================================================
export const ipUsages = sqliteTable(
  "ip_usages",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    yearMonth: text("year_month").notNull(),
    fixedAmount: real("fixed_amount").notNull().default(0),        // 固定分（SF商品①・切り上げ後）
    mobileNaviAmount: real("mobile_navi_amount").notNull().default(0), // 携帯＋ナビ分（SF商品②・切り上げ後）
    totalAmount: real("total_amount").notNull().default(0),        // ①＋②の総合計
    sfStatus: text("sf_status", {
      enum: ["未送信", "送信済", "エラー", "対応不要"],
    })
      .notNull()
      .default("未送信"),
    sfSentAt: text("sf_sent_at"),
    sfErrorMessage: text("sf_error_message"),
    sfNoActionReason: text("sf_no_action_reason"),
    importedAt: text("imported_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("idx_ip_usages_tenant_month").on(t.tenantId, t.yearMonth)]
);

// ============================================================
// IP Usage Details（番号×通話種別の内訳）
// ============================================================
export const ipUsageDetails = sqliteTable(
  "ip_usage_details",
  {
    id: text("id").primaryKey(),
    ipUsageId: text("ip_usage_id")
      .notNull()
      .references(() => ipUsages.id),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    phoneNumber: text("phone_number").notNull(),
    callCategory: text("call_category", {
      enum: ["固定", "携帯", "ナビ秒", "ナビ金額"],
    }).notNull(),
    callTypeName: text("call_type_name").notNull(), // H列の通話種別名称
    totalSeconds: integer("total_seconds").notNull().default(0),
    sourceAmount: real("source_amount").notNull().default(0), // O列金額合計（ナビ金額用）
    computedAmount: real("computed_amount").notNull().default(0), // タリフ計算後金額（小数のまま）
    yearMonth: text("year_month").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("idx_ip_usage_details_usage").on(t.ipUsageId),
    index("idx_ip_usage_details_tenant").on(t.tenantId),
    index("idx_ip_usage_details_month").on(t.yearMonth),
  ]
);

// ============================================================
// IP Import Unmatched（CDR取込 未紐付け番号）
// ============================================================
export const ipImportUnmatched = sqliteTable(
  "ip_import_unmatched",
  {
    id: text("id").primaryKey(),
    yearMonth: text("year_month").notNull(),
    phoneNumber: text("phone_number").notNull(), // 正規化済みのご利用番号
    // { [通話種別名称]: { category, seconds, amount } }
    itemsJson: text("items_json").notNull().default("{}"),
    totalSeconds: integer("total_seconds").notNull().default(0),
    status: text("status", { enum: ["pending", "resolved", "ignored"] })
      .notNull()
      .default("pending"),
    resolvedTenantId: text("resolved_tenant_id").references(() => tenants.id),
    importedAt: text("imported_at").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("idx_ip_import_unmatched_month").on(t.yearMonth)]
);

// ============================================================
// IP Master Import Unmatched（番号マスタCSV一括登録 未照合tenant）
// ============================================================
export const ipMasterUnmatched = sqliteTable(
  "ip_master_unmatched",
  {
    id: text("id").primaryKey(),
    phoneNumber: text("phone_number").notNull().unique(), // 正規化済み表番号
    subNumber: text("sub_number"),
    attemptedTenantKey: text("attempted_tenant_key").notNull(), // CSV上のtenant/会社名(未マッチ)
    sourceName: text("source_name"), // インポート元CSVのファイル名等
    notes: text("notes"),
    status: text("status", { enum: ["pending", "resolved", "ignored"] })
      .notNull()
      .default("pending"),
    resolvedTenantId: text("resolved_tenant_id").references(() => tenants.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("idx_ip_master_unmatched_status").on(t.status)]
);

// ============================================================
// IP Import Files（CDR取込履歴・重複判定）
// ============================================================
export const ipImportFiles = sqliteTable("ip_import_files", {
  id: text("id").primaryKey(),
  fileName: text("file_name").notNull(),
  fileHash: text("file_hash").notNull().unique(),
  billingAccount: text("billing_account"),
  yearMonth: text("year_month"),
  rowCount: integer("row_count").notNull().default(0),
  importedAt: text("imported_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ============================================================
// Channel Groups（チャンネルグループ）
// ※ 旧IP回線構造。ip_numbers への初期データ移行（Phase E）完了後に削除する
// ============================================================
export const channelGroups = sqliteTable(
  "channel_groups",
  {
    id: text("id").primaryKey(),
    billingAccountId: text("billing_account_id")
      .notNull()
      .references(() => billingAccounts.id),
    label: text("label").notNull(),                      // F列: 企業名 / チャンネルグループ名
    contractCh: integer("contract_ch").notNull().default(0), // M列: 契約ch数
    tenantId: text("tenant_id").references(() => tenants.id), // テナントとのリンク
    status: text("status", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("idx_channel_groups_billing").on(t.billingAccountId),
    index("idx_channel_groups_tenant").on(t.tenantId),
  ]
);

// ============================================================
// Phone Numbers（電話番号 / チャンネル）
// ※ 旧IP回線構造。ip_numbers への初期データ移行（Phase E）完了後に削除する
// ============================================================
export const phoneNumbers = sqliteTable(
  "phone_numbers",
  {
    id: text("id").primaryKey(),
    channelGroupId: text("channel_group_id")
      .notNull()
      .references(() => channelGroups.id),
    number: text("number").notNull().unique(),           // I列: 電話番号（ハイフンなし）
    freeCall: text("free_call"),                         // J列: フリーコール番号
    category: text("category", { enum: ["基本番号", "追加番号"] }).notNull(), // H列
    contractStatus: text("contract_status", { enum: ["契約中", "解約済"] })
      .notNull()
      .default("契約中"),                                // G列: 契約ステータス
    applyDate: text("apply_date"),                       // K列: 適用日
    cancelDate: text("cancel_date"),                     // L列: 解約日
    chControl: integer("ch_control"),                    // N列: ch制御
    notes: text("notes"),                                // O列: 備考
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("idx_phone_numbers_channel_group").on(t.channelGroupId)]
);

// ============================================================
// Tenant Assignments（テナント割り当て）
// ※ 旧IP回線構造。ip_numbers への初期データ移行（Phase E）完了後に削除する
// ============================================================
export const tenantAssignments = sqliteTable(
  "tenant_assignments",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    phoneNumberId: text("phone_number_id")
      .notNull()
      .references(() => phoneNumbers.id),
    allocatedCh: integer("allocated_ch").notNull().default(0),
    unitCode: text("unit_code"),
    startMonth: text("start_month").notNull(),
    endMonth: text("end_month"),
    unitChStatus: text("unit_ch_status", {
      enum: ["不要", "検討中", "対応中", "完了"],
    })
      .notNull()
      .default("不要"),
    unitChNotes: text("unit_ch_notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("idx_assignments_tenant").on(t.tenantId),
    index("idx_assignments_phone").on(t.phoneNumberId),
  ]
);

// ============================================================
// Actions（アクション管理）
// ============================================================
export const actions = sqliteTable(
  "actions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").references(() => tenants.id),
    type: text("type", {
      enum: ["SF送信待ち", "請求差分確認", "ユニットch対応", "その他"],
    }).notNull(),
    description: text("description").notNull(),
    assigneeId: text("assignee_id").references(() => users.id),
    status: text("status", { enum: ["未着手", "対応中", "完了"] })
      .notNull()
      .default("未着手"),
    dueDate: text("due_date"),
    resolvedAt: text("resolved_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("idx_actions_tenant").on(t.tenantId)]
);

// ============================================================
// Mobile Billing Items（SoftBank課金項目マスタ）
// ============================================================
export const mobileBillingItems = sqliteTable("mobile_billing_items", {
  id: text("id").primaryKey(),
  itemName: text("item_name").notNull().unique(), // CSV/Excelヘッダ行の項目名でマッチング
  isBillable: integer("is_billable", { mode: "boolean" }).notNull().default(true),
  continuousImport: integer("continuous_import", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ============================================================
// Mobile Import Unmatched（SoftBank取込未照合行）
// ============================================================
export const mobileImportUnmatched = sqliteTable("mobile_import_unmatched", {
  id: text("id").primaryKey(),
  yearMonth: text("year_month").notNull(),
  rawName: text("raw_name").notNull(),
  phoneNumber: text("phone_number"),
  overageTotal: real("overage_total").notNull().default(0),
  itemsJson: text("items_json").notNull().default("{}"),
  status: text("status", { enum: ["pending", "resolved", "ignored"] })
    .notNull()
    .default("pending"),
  resolvedTenantId: text("resolved_tenant_id").references(() => tenants.id),
  importedAt: text("imported_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ============================================================
// Audit Logs（監査ログ）
// ============================================================
export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  actionType: text("action_type").notNull(),
  message: text("message"),
  targetTable: text("target_table"),
  targetId: text("target_id"),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ============================================================
// SB法人コンシェル同期
//
// 3層に分ける:
//   concierge_sync_runs … いつ・どの経路で取得したか。失敗も必ず残す
//   concierge_lines     … コンシェル側の「現状」ミラー（電話番号ごとに1行）
//   concierge_diffs     … 差分の提案→承認→反映。削除しない＝変更記録の本体
//
// mobile_lines（台帳）を更新できるのは承認APIだけ。同期処理は触らない（INV-2）。
// ============================================================

/** 同期の実行履歴。ジョブ起動の「前」に queued で作る（INV-3） */
export const conciergeSyncRuns = sqliteTable(
  "concierge_sync_runs",
  {
    id: text("id").primaryKey(),
    /** probe | read | write | billing_csv */
    runType: text("run_type").notNull(),
    /** schedule | manual | import */
    trigger: text("trigger").notNull(),
    triggeredByUserId: text("triggered_by_user_id").references(() => users.id),
    status: text("status", {
      enum: ["queued", "running", "succeeded", "partial", "failed", "timeout"],
    })
      .notNull()
      .default("queued"),
    queuedAt: text("queued_at").notNull(),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    /** 30秒ごとに更新。途絶えたら sweepStaleRuns が timeout に確定させる */
    heartbeatAt: text("heartbeat_at"),
    currentStep: text("current_step"),
    linesSeen: integer("lines_seen").notNull().default(0),
    diffsCreated: integer("diffs_created").notNull().default(0),
    writesAttempted: integer("writes_attempted").notNull().default(0),
    writesSucceeded: integer("writes_succeeded").notNull().default(0),
    errorMessage: text("error_message"),
    /** [{at, step, level, message}] 上限200件 */
    logJson: text("log_json").notNull().default("[]"),
    /** 失敗時スクショ等のGCSパス */
    artifactsJson: text("artifacts_json").notNull().default("[]"),
    /** run ごとに使い捨て。終端になったら無効 */
    callbackToken: text("callback_token").notNull(),
    executionName: text("execution_name"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("idx_concierge_runs_queued").on(t.queuedAt),
    index("idx_concierge_runs_status").on(t.status),
  ]
);

/** コンシェル側の現状ミラー。新しい観測が古い観測を上書きする */
export const conciergeLines = sqliteTable(
  "concierge_lines",
  {
    id: text("id").primaryKey(),
    /** phoneMatchKey の結果。突合はこれだけを使う */
    phoneKey: text("phone_key").notNull().unique(),
    /** 観測した生表記（表示・証跡用） */
    phoneNumber: text("phone_number").notNull(),
    /** 氏名欄。運用上は提供先の会社名が入る */
    contactName: text("contact_name"),
    imei: text("imei"),
    iccid: text("iccid"),
    deptCode: text("dept_code"),
    deptName: text("dept_name"),
    planName: text("plan_name"),
    lineStatus: text("line_status"),
    /** billing_csv（月次請求CSV＝断面） | concierge（Playwrightの日次取得） */
    source: text("source", { enum: ["billing_csv", "concierge"] }).notNull(),
    /** 観測の出どころ。CSVなら年月（例 2026-07）、Playwrightなら runId */
    sourceRef: text("source_ref"),
    /** いつ時点の値か。古い観測で新しい観測を上書きしないための判定に使う */
    observedAt: text("observed_at").notNull(),
    /** 取得した全列。画面変更への耐性とデバッグ材料 */
    rawJson: text("raw_json"),
    firstSeenAt: text("first_seen_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    lastSeenRunId: text("last_seen_run_id").references(
      () => conciergeSyncRuns.id
    ),
    /** 直近runで消えた＝解約候補 */
    disappearedAt: text("disappeared_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("idx_concierge_lines_iccid").on(t.iccid)]
);

/**
 * 差分（提案→承認→反映）。終端になっても削除しない。
 * 「この番号に過去なにがあったか」は WHERE phone_key = ? の1本で出る。
 */
export const conciergeDiffs = sqliteTable(
  "concierge_diffs",
  {
    id: text("id").primaryKey(),
    /** inbound（コンシェル→lime・SBが正） | outbound（lime→コンシェル・氏名欄のみ） */
    direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
    diffType: text("diff_type", {
      enum: [
        "line_added",
        "line_removed",
        "number_changed",
        "imei_changed",
        "iccid_changed",
        "name_mismatch",
      ],
    }).notNull(),
    phoneKey: text("phone_key").notNull(),
    phoneNumber: text("phone_number").notNull(),
    mobileLineId: text("mobile_line_id").references(() => mobileLines.id),
    tenantId: text("tenant_id").references(() => tenants.id),
    /** imei | iccid | contact_name | phone_number | null（行単位） */
    field: text("field"),
    beforeValue: text("before_value"),
    afterValue: text("after_value"),
    /** 提案時点のコンシェル値。outbound の書き込み直前の競合検知に使う */
    baseConciergeValue: text("base_concierge_value"),
    payloadJson: text("payload_json"),
    status: text("status", {
      enum: [
        "pending",
        "approved",
        "applied",
        "failed",
        "rejected",
        "superseded",
      ],
    })
      .notNull()
      .default("pending"),
    detectedRunId: text("detected_run_id")
      .notNull()
      .references(() => conciergeSyncRuns.id),
    appliedRunId: text("applied_run_id").references(() => conciergeSyncRuns.id),
    reviewedByUserId: text("reviewed_by_user_id").references(() => users.id),
    reviewedAt: text("reviewed_at"),
    appliedAt: text("applied_at"),
    errorMessage: text("error_message"),
    note: text("note"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("idx_concierge_diffs_status").on(t.status),
    index("idx_concierge_diffs_phone").on(t.phoneKey),
    index("idx_concierge_diffs_run").on(t.detectedRunId),
  ]
);

// ============================================================
// アプリ内お知らせ
// ============================================================
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    level: text("level", { enum: ["info", "warn", "error"] })
      .notNull()
      .default("info"),
    category: text("category").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    linkUrl: text("link_url"),
    refTable: text("ref_table"),
    refId: text("ref_id"),
    /** Slackに飛ばなかったことも後から分かるように結果を残す */
    slackStatus: text("slack_status", { enum: ["sent", "failed", "skipped"] })
      .notNull()
      .default("skipped"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("idx_notifications_created").on(t.createdAt)]
);
