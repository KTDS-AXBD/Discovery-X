-- ============================================================================
-- 0010: R3 — KPI 선행지표, Discovery 링크, 알림, 웹훅, Gate 승인 (v3 R3)
-- ============================================================================

-- 0) discoveries 테이블에 gatekeeper_id 컬럼 추가
ALTER TABLE `discoveries` ADD COLUMN `gatekeeper_id` text REFERENCES `users`(`id`);

-- 1) discovery_kpis 테이블
CREATE TABLE IF NOT EXISTS `discovery_kpis` (
  `id` text PRIMARY KEY NOT NULL,
  `discovery_id` text NOT NULL REFERENCES `discoveries`(`id`) ON DELETE CASCADE,
  `name` text NOT NULL,
  `unit` text NOT NULL,
  `target_value` integer,
  `warning_threshold` integer,
  `critical_threshold` integer,
  `direction` text NOT NULL DEFAULT 'higher_is_better',
  `method_pack_id` text REFERENCES `method_packs`(`id`),
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS `idx_discovery_kpis_discovery_id` ON `discovery_kpis`(`discovery_id`);

-- 2) kpi_measurements 테이블
CREATE TABLE IF NOT EXISTS `kpi_measurements` (
  `id` text PRIMARY KEY NOT NULL,
  `kpi_id` text NOT NULL REFERENCES `discovery_kpis`(`id`) ON DELETE CASCADE,
  `value` integer NOT NULL,
  `note` text,
  `measured_at` integer NOT NULL DEFAULT (unixepoch()),
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS `idx_kpi_measurements_kpi_id` ON `kpi_measurements`(`kpi_id`);
CREATE INDEX IF NOT EXISTS `idx_kpi_measurements_measured_at` ON `kpi_measurements`(`measured_at`);

-- 3) discovery_links 테이블
CREATE TABLE IF NOT EXISTS `discovery_links` (
  `id` text PRIMARY KEY NOT NULL,
  `from_discovery_id` text NOT NULL REFERENCES `discoveries`(`id`) ON DELETE CASCADE,
  `to_discovery_id` text NOT NULL REFERENCES `discoveries`(`id`) ON DELETE CASCADE,
  `link_type` text NOT NULL,
  `note` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS `idx_discovery_links_from` ON `discovery_links`(`from_discovery_id`);
CREATE INDEX IF NOT EXISTS `idx_discovery_links_to` ON `discovery_links`(`to_discovery_id`);

-- 4) alert_rules 테이블
CREATE TABLE IF NOT EXISTS `alert_rules` (
  `id` text PRIMARY KEY NOT NULL,
  `alert_type` text NOT NULL,
  `name` text NOT NULL,
  `condition` text,
  `severity` text NOT NULL DEFAULT 'warning',
  `enabled` integer NOT NULL DEFAULT 1,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS `idx_alert_rules_alert_type` ON `alert_rules`(`alert_type`);

-- 5) alerts 테이블
CREATE TABLE IF NOT EXISTS `alerts` (
  `id` text PRIMARY KEY NOT NULL,
  `rule_id` text REFERENCES `alert_rules`(`id`),
  `discovery_id` text REFERENCES `discoveries`(`id`) ON DELETE CASCADE,
  `kpi_id` text REFERENCES `discovery_kpis`(`id`) ON DELETE CASCADE,
  `severity` text NOT NULL,
  `message` text NOT NULL,
  `acknowledged` integer NOT NULL DEFAULT 0,
  `acknowledged_at` integer,
  `acknowledged_by` text REFERENCES `users`(`id`),
  `fired_at` integer NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS `idx_alerts_discovery_id` ON `alerts`(`discovery_id`);
CREATE INDEX IF NOT EXISTS `idx_alerts_severity` ON `alerts`(`severity`);
CREATE INDEX IF NOT EXISTS `idx_alerts_acknowledged` ON `alerts`(`acknowledged`);

-- 6) webhook_configs 테이블
CREATE TABLE IF NOT EXISTS `webhook_configs` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `url` text NOT NULL,
  `events` text,
  `platform` text,
  `headers` text,
  `enabled` integer NOT NULL DEFAULT 1,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS `idx_webhook_configs_enabled` ON `webhook_configs`(`enabled`);

-- 7) gate_approvals 테이블
CREATE TABLE IF NOT EXISTS `gate_approvals` (
  `id` text PRIMARY KEY NOT NULL,
  `gate_package_id` text NOT NULL REFERENCES `gate_packages`(`id`) ON DELETE CASCADE,
  `reviewer_id` text NOT NULL REFERENCES `users`(`id`),
  `decision` text NOT NULL DEFAULT 'PENDING',
  `comment` text,
  `requested_at` integer NOT NULL DEFAULT (unixepoch()),
  `decided_at` integer,
  `sla_deadline` integer
);
CREATE INDEX IF NOT EXISTS `idx_gate_approvals_gate_package_id` ON `gate_approvals`(`gate_package_id`);
CREATE INDEX IF NOT EXISTS `idx_gate_approvals_reviewer_id` ON `gate_approvals`(`reviewer_id`);
CREATE INDEX IF NOT EXISTS `idx_gate_approvals_decision` ON `gate_approvals`(`decision`);
