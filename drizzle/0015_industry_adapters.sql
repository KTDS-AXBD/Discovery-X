-- Industry Adapter 프레임워크 (F1)
CREATE TABLE `industry_adapters` (
  `id` text PRIMARY KEY NOT NULL,
  `code` text NOT NULL,
  `name_ko` text NOT NULL,
  `description` text,
  `icon` text,
  `color` text NOT NULL DEFAULT '#6B7280',
  `regulatory_framework` text,
  `compliance_requirements` text,
  `default_timebox_days` integer DEFAULT 28,
  `evidence_weight_modifiers` text,
  `parent_adapter_id` text REFERENCES `industry_adapters`(`id`),
  `enabled` integer NOT NULL DEFAULT 1,
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  `updated_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_industry_adapters_code` ON `industry_adapters`(`code`);
--> statement-breakpoint
CREATE INDEX `idx_industry_adapters_enabled` ON `industry_adapters`(`enabled`);
--> statement-breakpoint
CREATE TABLE `industry_rules` (
  `id` text PRIMARY KEY NOT NULL,
  `industry_adapter_id` text NOT NULL REFERENCES `industry_adapters`(`id`) ON DELETE CASCADE,
  `rule_type` text NOT NULL,
  `name_ko` text NOT NULL,
  `condition` text NOT NULL,
  `action` text NOT NULL,
  `priority` integer DEFAULT 0,
  `enabled` integer NOT NULL DEFAULT 1,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX `idx_industry_rules_adapter` ON `industry_rules`(`industry_adapter_id`);
--> statement-breakpoint
CREATE INDEX `idx_industry_rules_type` ON `industry_rules`(`rule_type`);
--> statement-breakpoint
ALTER TABLE `discoveries` ADD COLUMN `industry_adapter_id` text REFERENCES `industry_adapters`(`id`);
--> statement-breakpoint
CREATE INDEX `idx_discoveries_industry` ON `discoveries`(`industry_adapter_id`);
