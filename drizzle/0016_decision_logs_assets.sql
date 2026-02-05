-- AI 운영 로그 자산화 (F3)
CREATE TABLE `decision_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `discovery_id` text NOT NULL REFERENCES `discoveries`(`id`) ON DELETE CASCADE,
  `conversation_id` text REFERENCES `conversations`(`id`),
  `decision_type` text NOT NULL,
  `input_context` text,
  `decision_result` text NOT NULL,
  `confidence_score` integer,
  `rationale` text,
  `actor_type` text NOT NULL DEFAULT 'agent',
  `actor_id` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  `archived_at` integer,
  `archive_batch_id` text
);
--> statement-breakpoint
CREATE INDEX `idx_decision_logs_discovery` ON `decision_logs`(`discovery_id`);
--> statement-breakpoint
CREATE INDEX `idx_decision_logs_type` ON `decision_logs`(`decision_type`);
--> statement-breakpoint
CREATE INDEX `idx_decision_logs_created` ON `decision_logs`(`created_at`);
--> statement-breakpoint
CREATE TABLE `extracted_patterns` (
  `id` text PRIMARY KEY NOT NULL,
  `pattern_type` text NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `conditions` text,
  `frequency` integer DEFAULT 1,
  `source_log_ids` text,
  `industry_adapter_id` text REFERENCES `industry_adapters`(`id`),
  `confidence_score` integer,
  `validated_at` integer,
  `validated_by` text REFERENCES `users`(`id`),
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  `updated_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX `idx_extracted_patterns_type` ON `extracted_patterns`(`pattern_type`);
--> statement-breakpoint
CREATE TABLE `reusable_rules` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `rule_type` text NOT NULL,
  `condition_expression` text NOT NULL,
  `action_template` text,
  `applicable_stages` text,
  `industry_adapter_id` text REFERENCES `industry_adapters`(`id`),
  `source_pattern_id` text REFERENCES `extracted_patterns`(`id`),
  `source_evidence_ids` text,
  `enabled` integer NOT NULL DEFAULT 1,
  `priority` integer DEFAULT 0,
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  `updated_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX `idx_reusable_rules_type` ON `reusable_rules`(`rule_type`);
--> statement-breakpoint
CREATE INDEX `idx_reusable_rules_enabled` ON `reusable_rules`(`enabled`);
