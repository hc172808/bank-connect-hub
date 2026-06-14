import { pgTable, uuid, text, numeric, boolean, timestamp, integer, jsonb, date, bigint } from "drizzle-orm/pg-core";

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  full_name: text("full_name"),
  phone_number: text("phone_number").unique(),
  avatar_url: text("avatar_url"),
  address: text("address"),
  city: text("city"),
  country: text("country"),
  date_of_birth: date("date_of_birth"),
  bio: text("bio"),
  wallet_address: text("wallet_address"),
  wallet_created_at: timestamp("wallet_created_at", { withTimezone: true }),
  store_name: text("store_name"),
  pin_hash: text("pin_hash"),
  two_factor_enabled: boolean("two_factor_enabled").default(false).notNull(),
  kyc_status: text("kyc_status").default("unverified").notNull(),
  disabled: boolean("disabled").default(false).notNull(),
  disabled_at: timestamp("disabled_at", { withTimezone: true }),
  disabled_by: uuid("disabled_by"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const user_roles = pgTable("user_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull(),
  role: text("role").notNull(),
});

export const wallets = pgTable("wallets", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().unique(),
  balance: numeric("balance", { precision: 10, scale: 2 }).default("0.00").notNull(),
  currency: text("currency").default("USD").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sender_id: uuid("sender_id").notNull(),
  receiver_id: uuid("receiver_id").notNull(),
  amount: numeric("amount").notNull(),
  fee: numeric("fee").default("0").notNull(),
  status: text("status").default("pending").notNull(),
  transaction_type: text("transaction_type").notNull(),
  description: text("description"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completed_at: timestamp("completed_at", { withTimezone: true }),
});

export const transaction_fees = pgTable("transaction_fees", {
  id: uuid("id").primaryKey().defaultRandom(),
  transaction_type: text("transaction_type").notNull().unique(),
  fee_percentage: numeric("fee_percentage").default("0").notNull(),
  fixed_fee: numeric("fixed_fee").default("0").notNull(),
  updated_by: uuid("updated_by"),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const fund_requests = pgTable("fund_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  requester_id: uuid("requester_id").notNull(),
  payer_id: uuid("payer_id").notNull(),
  amount: numeric("amount").notNull(),
  verification_code: text("verification_code").notNull(),
  status: text("status").default("pending").notNull(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completed_at: timestamp("completed_at", { withTimezone: true }),
});

export const pending_deposits = pgTable("pending_deposits", {
  id: uuid("id").primaryKey().defaultRandom(),
  agent_id: uuid("agent_id").notNull(),
  user_id: uuid("user_id").notNull(),
  amount: numeric("amount").notNull(),
  status: text("status").default("pending").notNull(),
  approved_by: uuid("approved_by"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  processed_at: timestamp("processed_at", { withTimezone: true }),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").default("info").notNull(),
  is_read: boolean("is_read").default(false).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const feature_toggles = pgTable("feature_toggles", {
  id: uuid("id").primaryKey().defaultRandom(),
  feature_key: text("feature_key").notNull().unique(),
  feature_name: text("feature_name").notNull(),
  is_enabled: boolean("is_enabled").default(false).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updated_by: uuid("updated_by"),
});

export const blockchain_settings = pgTable("blockchain_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  rpc_url: text("rpc_url"),
  chain_id: text("chain_id"),
  native_coin_symbol: text("native_coin_symbol").default("GYD").notNull(),
  native_coin_name: text("native_coin_name").default("GYD Coin").notNull(),
  explorer_url: text("explorer_url"),
  is_active: boolean("is_active").default(false).notNull(),
  liquidity_pool_address: text("liquidity_pool_address"),
  fee_wallet_address: text("fee_wallet_address"),
  fee_wallet_encrypted_key: text("fee_wallet_encrypted_key"),
  gas_fee_gyd: numeric("gas_fee_gyd").default("0.01").notNull(),
  rpc_urls: jsonb("rpc_urls").default([]),
  updated_by: uuid("updated_by"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const supported_coins = pgTable("supported_coins", {
  id: uuid("id").primaryKey().defaultRandom(),
  coin_symbol: text("coin_symbol").notNull().unique(),
  coin_name: text("coin_name").notNull(),
  contract_address: text("contract_address"),
  is_native: boolean("is_native").default(false).notNull(),
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const conversion_fees = pgTable("conversion_fees", {
  id: uuid("id").primaryKey().defaultRandom(),
  from_coin: text("from_coin").notNull(),
  to_coin: text("to_coin").notNull(),
  fee_percentage: numeric("fee_percentage").default("1.0").notNull(),
  is_active: boolean("is_active").default(true).notNull(),
  updated_by: uuid("updated_by"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const vendor_products = pgTable("vendor_products", {
  id: uuid("id").primaryKey().defaultRandom(),
  vendor_id: uuid("vendor_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  logo_url: text("logo_url"),
  price: numeric("price").notNull(),
  discount_price: numeric("discount_price"),
  category: text("category"),
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const vendor_registration_fees = pgTable("vendor_registration_fees", {
  id: uuid("id").primaryKey().defaultRandom(),
  fee_amount: numeric("fee_amount").default("0").notNull(),
  fee_name: text("fee_name").default("Vendor Registration Fee").notNull(),
  is_active: boolean("is_active").default(true).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updated_by: uuid("updated_by"),
});

export const fund_reversals = pgTable("fund_reversals", {
  id: uuid("id").primaryKey().defaultRandom(),
  transaction_id: uuid("transaction_id").notNull(),
  requester_id: uuid("requester_id").notNull(),
  recipient_id: uuid("recipient_id").notNull(),
  amount: numeric("amount").notNull(),
  reason: text("reason"),
  status: text("status").default("pending").notNull(),
  approved_by: uuid("approved_by"),
  requested_at: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  approved_at: timestamp("approved_at", { withTimezone: true }),
  funds_held_at: timestamp("funds_held_at", { withTimezone: true }),
  funds_returned_at: timestamp("funds_returned_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const mobile_money_providers = pgTable("mobile_money_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ussd_code: text("ussd_code"),
  logo_letter: text("logo_letter").default("?").notNull(),
  color: text("color").default("bg-muted-foreground").notNull(),
  merchant_number: text("merchant_number"),
  instructions: text("instructions"),
  is_active: boolean("is_active").default(true).notNull(),
  sort_order: integer("sort_order").default(0).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const changelog_entries = pgTable("changelog_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: text("version").notNull(),
  is_latest: boolean("is_latest").default(false).notNull(),
  items: jsonb("items").default([]).notNull(),
  released_at: timestamp("released_at", { withTimezone: true }).defaultNow().notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  created_by: uuid("created_by"),
});

export const announcements = pgTable("announcements", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  body: text("body"),
  image_url: text("image_url"),
  link_url: text("link_url"),
  starts_at: timestamp("starts_at", { withTimezone: true }).defaultNow().notNull(),
  ends_at: timestamp("ends_at", { withTimezone: true }),
  is_active: boolean("is_active").default(true).notNull(),
  created_by: uuid("created_by"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const countries = pgTable("countries", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  dial_code: text("dial_code").notNull(),
  local_number_length: integer("local_number_length").default(7).notNull(),
  is_allowed: boolean("is_allowed").default(true).notNull(),
  is_banned: boolean("is_banned").default(false).notNull(),
  sort_order: integer("sort_order").default(0).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const audit_logs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actor_id: uuid("actor_id"),
  actor_role: text("actor_role"),
  action: text("action").notNull(),
  entity_type: text("entity_type"),
  entity_id: text("entity_id"),
  metadata: jsonb("metadata").default({}).notNull(),
  ip_address: text("ip_address"),
  user_agent: text("user_agent"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const kyc_submissions = pgTable("kyc_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull(),
  full_name: text("full_name").notNull(),
  date_of_birth: date("date_of_birth").notNull(),
  address: text("address").notNull(),
  country: text("country").notNull(),
  document_type: text("document_type").notNull(),
  document_number: text("document_number").notNull(),
  document_front_url: text("document_front_url"),
  document_back_url: text("document_back_url"),
  selfie_url: text("selfie_url"),
  status: text("status").default("pending").notNull(),
  rejection_reason: text("rejection_reason"),
  reviewed_by: uuid("reviewed_by"),
  reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const suspicious_activity_alerts = pgTable("suspicious_activity_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id"),
  alert_type: text("alert_type").notNull(),
  severity: text("severity").default("medium").notNull(),
  description: text("description").notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  status: text("status").default("open").notNull(),
  reviewed_by: uuid("reviewed_by"),
  reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const two_factor_auth = pgTable("two_factor_auth", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().unique(),
  secret: text("secret").notNull(),
  backup_codes: text("backup_codes").array().default([]).notNull(),
  enabled: boolean("enabled").default(false).notNull(),
  verified_at: timestamp("verified_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const device_sessions = pgTable("device_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull(),
  device_name: text("device_name"),
  browser: text("browser"),
  os: text("os"),
  ip_address: text("ip_address"),
  location: text("location"),
  user_agent: text("user_agent"),
  is_current: boolean("is_current").default(false).notNull(),
  last_active_at: timestamp("last_active_at", { withTimezone: true }).defaultNow().notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  revoked_at: timestamp("revoked_at", { withTimezone: true }),
});

export const app_releases = pgTable("app_releases", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: text("version").notNull(),
  platform: text("platform").default("web").notNull(),
  file_url: text("file_url").notNull(),
  release_notes: text("release_notes"),
  is_force_update: boolean("is_force_update").default(false).notNull(),
  is_latest: boolean("is_latest").default(false).notNull(),
  file_size: bigint("file_size", { mode: "number" }),
  file_path: text("file_path"),
  created_by: uuid("created_by"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const app_settings = pgTable("app_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  value: jsonb("value").default({}).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updated_by: uuid("updated_by"),
});

export const qr_card_requests = pgTable("qr_card_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull(),
  status: text("status").default("pending").notNull(),
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  fulfilled_at: timestamp("fulfilled_at", { withTimezone: true }),
  fulfilled_by: uuid("fulfilled_by"),
});

export const biometric_credentials = pgTable("biometric_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull(),
  credential_id: text("credential_id").notNull().unique(),
  public_key: text("public_key").notNull(),
  device_name: text("device_name").default("Unknown Device"),
  auth_type: text("auth_type").default("fingerprint").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  last_used_at: timestamp("last_used_at", { withTimezone: true }),
});

export const gas_fee_ledger = pgTable("gas_fee_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  transaction_type: text("transaction_type").notNull(),
  amount: numeric("amount").notNull(),
  related_transaction_id: uuid("related_transaction_id"),
  user_id: uuid("user_id"),
  description: text("description"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const user_wallets = pgTable("user_wallets", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().unique(),
  wallet_address: text("wallet_address").notNull(),
  encrypted_private_key: text("encrypted_private_key").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const external_databases = pgTable("external_databases", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: integer("port").default(5432).notNull(),
  database_name: text("database_name").notNull(),
  username: text("username").notNull(),
  secret_key: text("secret_key").notNull(),
  created_by: uuid("created_by"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const database_backups = pgTable("database_backups", {
  id: uuid("id").primaryKey().defaultRandom(),
  external_db_id: uuid("external_db_id"),
  backup_name: text("backup_name").notNull(),
  backup_type: text("backup_type").default("manual").notNull(),
  status: text("status").default("pending").notNull(),
  file_size: bigint("file_size", { mode: "number" }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
