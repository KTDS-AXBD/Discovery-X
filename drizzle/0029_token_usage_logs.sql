CREATE TABLE `token_usage_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text,
	`mode` text NOT NULL DEFAULT 'default',
	`model` text NOT NULL,
	`input_tokens` integer NOT NULL DEFAULT 0,
	`output_tokens` integer NOT NULL DEFAULT 0,
	`total_tokens` integer NOT NULL DEFAULT 0,
	`tool_rounds` integer NOT NULL DEFAULT 0,
	`tenant_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_token_usage_tenant` ON `token_usage_logs` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_token_usage_created_at` ON `token_usage_logs` (`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_token_usage_mode` ON `token_usage_logs` (`mode`);
