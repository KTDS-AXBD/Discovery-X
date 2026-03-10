-- 0054: AI API 서비스 관리 — 3-Ledger + Policy Engine + Capability-aware Fallback
-- DX-PLAN-008 v1.2, Phase 1 (P1-01/P1-02)

-- ═══════════════════════════════════════════════════════════════
-- Layer 1: Usage Ledger
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE `usage_events` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `tenant_id` text NOT NULL,
  `conversation_id` text,
  `provider` text NOT NULL,
  `model` text NOT NULL,
  `purpose` text NOT NULL,
  `input_tokens` integer NOT NULL DEFAULT 0,
  `output_tokens` integer NOT NULL DEFAULT 0,
  `cache_read_tokens` integer DEFAULT 0,
  `cache_write_tokens` integer DEFAULT 0,
  `total_tokens` integer NOT NULL DEFAULT 0,
  `latency_ms` integer,
  `tool_rounds` integer DEFAULT 0,
  `retry_of` text,
  `routing_decision_id` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX `idx_ue_tenant_created` ON `usage_events` (`tenant_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_ue_user_created` ON `usage_events` (`user_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_ue_provider` ON `usage_events` (`provider`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_ue_purpose` ON `usage_events` (`purpose`, `created_at`);
--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════
-- Layer 2: Cost Estimation Ledger
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE `cost_estimates` (
  `id` text PRIMARY KEY NOT NULL,
  `usage_event_id` text NOT NULL,
  `price_version_id` text NOT NULL,
  `input_cost_usd` real NOT NULL DEFAULT 0,
  `output_cost_usd` real NOT NULL DEFAULT 0,
  `cache_cost_usd` real DEFAULT 0,
  `total_cost_usd` real NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cost_estimates_usage_event_id_unique` ON `cost_estimates` (`usage_event_id`);
--> statement-breakpoint
CREATE INDEX `idx_ce_usage_event` ON `cost_estimates` (`usage_event_id`);
--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════
-- 4-Catalog SSOT
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE `model_catalog` (
  `id` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL,
  `model_id` text NOT NULL,
  `display_name` text NOT NULL,
  `capability_score` integer NOT NULL,
  `max_context_tokens` integer,
  `supports_tools` integer DEFAULT 0,
  `supports_streaming` integer DEFAULT 0,
  `supports_json_mode` integer DEFAULT 0,
  `is_active` integer DEFAULT 1,
  `updated_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint

CREATE TABLE `price_catalog` (
  `id` text PRIMARY KEY NOT NULL,
  `model_catalog_id` text NOT NULL,
  `input_price_per_m_token` real NOT NULL,
  `output_price_per_m_token` real NOT NULL,
  `cache_read_price_per_m_token` real,
  `cache_write_price_per_m_token` real,
  `effective_from` integer NOT NULL,
  `effective_to` integer,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX `idx_pc_model_effective` ON `price_catalog` (`model_catalog_id`, `effective_from`);
--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════
-- Budget Policies + Cache
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE `budget_policies` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `user_id` text,
  `purpose` text,
  `budget_usd` real NOT NULL,
  `period_start` integer NOT NULL,
  `period_end` integer NOT NULL,
  `threshold_warn_pct` integer DEFAULT 80,
  `threshold_degrade_pct` integer DEFAULT 100,
  `threshold_block_pct` integer DEFAULT 120,
  `is_active` integer DEFAULT 1,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX `idx_bp_tenant_user` ON `budget_policies` (`tenant_id`, `user_id`, `is_active`);
--> statement-breakpoint
CREATE INDEX `idx_bp_tenant_purpose` ON `budget_policies` (`tenant_id`, `purpose`, `is_active`);
--> statement-breakpoint

CREATE TABLE `budget_usage_cache` (
  `id` text PRIMARY KEY NOT NULL,
  `budget_policy_id` text NOT NULL,
  `current_usage_usd` real NOT NULL DEFAULT 0,
  `usage_pct` real NOT NULL DEFAULT 0,
  `budget_tier` text NOT NULL DEFAULT 'normal',
  `last_event_id` text,
  `updated_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budget_usage_cache_budget_policy_id_unique` ON `budget_usage_cache` (`budget_policy_id`);
--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════
-- Routing Policies + 정규화 테이블
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE `routing_policies` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text,
  `name` text NOT NULL,
  `version` integer NOT NULL DEFAULT 1,
  `is_active` integer DEFAULT 1,
  `priority` integer NOT NULL DEFAULT 100,
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  `updated_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint

CREATE TABLE `policy_provider_priorities` (
  `id` text PRIMARY KEY NOT NULL,
  `policy_id` text NOT NULL,
  `policy_version` integer NOT NULL,
  `provider` text NOT NULL,
  `priority` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ppp_policy_priority` ON `policy_provider_priorities` (`policy_id`, `policy_version`, `priority`);
--> statement-breakpoint

CREATE TABLE `policy_purpose_rules` (
  `id` text PRIMARY KEY NOT NULL,
  `policy_id` text NOT NULL,
  `policy_version` integer NOT NULL,
  `purpose` text NOT NULL,
  `min_capability_score` integer NOT NULL,
  `requires_tools` integer DEFAULT 0,
  `requires_json_mode` integer DEFAULT 0,
  `requires_streaming` integer DEFAULT 0,
  `degradable` integer NOT NULL,
  `degrade_to_score` integer
);
--> statement-breakpoint
CREATE INDEX `idx_ppr_policy_purpose` ON `policy_purpose_rules` (`policy_id`, `policy_version`, `purpose`);
--> statement-breakpoint

CREATE TABLE `policy_degrade_rules` (
  `id` text PRIMARY KEY NOT NULL,
  `policy_id` text NOT NULL,
  `policy_version` integer NOT NULL,
  `from_min_score` integer NOT NULL,
  `from_max_score` integer NOT NULL,
  `degrade_to_model_id` text,
  `action` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_pdr_policy_score` ON `policy_degrade_rules` (`policy_id`, `policy_version`, `from_min_score`);
--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════
-- Routing Decision Log
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE `routing_decisions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `tenant_id` text NOT NULL,
  `purpose` text NOT NULL,
  `selected_provider` text,
  `selected_model` text,
  `candidate_chain` text,
  `reason_code` text NOT NULL,
  `budget_state` text,
  `policy_id` text,
  `policy_version` integer,
  `fallback_count` integer DEFAULT 0,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX `idx_rd_tenant_created` ON `routing_decisions` (`tenant_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_rd_user_created` ON `routing_decisions` (`user_id`, `created_at`);
--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════
-- Daily Usage Aggregates (집계 캐시)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE `daily_usage_aggregates` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `user_id` text,
  `provider` text NOT NULL,
  `model` text NOT NULL,
  `purpose` text NOT NULL,
  `date` text NOT NULL,
  `request_count` integer NOT NULL DEFAULT 0,
  `total_input_tokens` integer DEFAULT 0,
  `total_output_tokens` integer DEFAULT 0,
  `total_tokens` integer DEFAULT 0,
  `total_cost_usd` real DEFAULT 0,
  `avg_latency_ms` integer,
  `updated_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX `idx_dua_tenant_date` ON `daily_usage_aggregates` (`tenant_id`, `date`);
--> statement-breakpoint
CREATE INDEX `idx_dua_user_date` ON `daily_usage_aggregates` (`user_id`, `date`);
