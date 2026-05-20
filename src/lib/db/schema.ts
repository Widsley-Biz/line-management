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
    status: text("status", { enum: ["契約中", "解約済"] })
      .notNull()
      .default("契約中"),
    contractStart: text("contract_start"),
    contractEnd: text("contract_end"),
    deviceReturned: integer("device_returned").notNull().default(0),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("idx_mobile_lines_tenant").on(t.tenantId)]
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
      enum: ["未送信", "送信済", "エラー", "超過なし"],
    })
      .notNull()
      .default("未送信"),
    sfSentAt: text("sf_sent_at"),
    sfErrorMessage: text("sf_error_message"),
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
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ============================================================
// Billing Accounts（請求アカウント）
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
// Channel Groups（チャンネルグループ）
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
// Packs（パックマスタ）
// ============================================================
export const packs = sqliteTable("packs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sfProductCode: text("sf_product_code").notNull().unique(),
  price: integer("price").notNull(),
  credit: integer("credit").notNull(),
  bonusRate: real("bonus_rate").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ============================================================
// Tenant Packs（テナントパック設定）
// ============================================================
export const tenantPacks = sqliteTable(
  "tenant_packs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    packId: text("pack_id")
      .notNull()
      .references(() => packs.id),
    quantity: integer("quantity").notNull().default(1),
    startMonth: text("start_month").notNull(),
    endMonth: text("end_month"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("idx_tenant_packs_tenant").on(t.tenantId)]
);

// ============================================================
// Monthly Usages（月次使用量）
// ============================================================
export const monthlyUsages = sqliteTable(
  "monthly_usages",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    yearMonth: text("year_month").notNull(),

    fixedSeconds: integer("fixed_seconds").notNull().default(0),
    mobileSeconds: integer("mobile_seconds").notNull().default(0),
    rawCost: real("raw_cost").notNull().default(0),

    ipCallCharge: real("ip_call_charge").notNull().default(0),
    fixedCallCharge: real("fixed_call_charge").notNull().default(0),
    mobileCallCharge: real("mobile_call_charge").notNull().default(0),

    totalPackPrice: integer("total_pack_price").notNull().default(0),
    totalCredit: integer("total_credit").notNull().default(0),
    usedCredit: real("used_credit").notNull().default(0),

    overageCharge: real("overage_charge").notNull().default(0),
    overageFixed: real("overage_fixed").notNull().default(0),
    overageMobile: real("overage_mobile").notNull().default(0),

    grossProfit: real("gross_profit").notNull().default(0),

    sfStatus: text("sf_status", {
      enum: ["未送信", "送信済", "エラー", "超過なし", "対応不要"],
    })
      .notNull()
      .default("未送信"),
    sfSentAt: text("sf_sent_at"),
    sfErrorMessage: text("sf_error_message"),

    dataSource: text("data_source"),
    importedAt: text("imported_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("idx_monthly_usages_tenant_month").on(t.tenantId, t.yearMonth),
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
// Call Logs（通話ログ）
// ============================================================
export const callLogs = sqliteTable(
  "call_logs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    yearMonth: text("year_month").notNull(),
    callDate: text("call_date"),
    phoneNumber: text("phone_number"),
    destinationNumber: text("destination_number"),
    destinationType: text("destination_type", {
      enum: ["固定", "携帯"],
    }).notNull(),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    cost: real("cost").notNull().default(0),
    source: text("source", { enum: ["AdjustOne", "ProDelight", "手動入力"] }).notNull(),
    importedAt: text("imported_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("idx_call_logs_tenant_month").on(t.tenantId, t.yearMonth),
    index("idx_call_logs_source").on(t.source),
  ]
);

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
