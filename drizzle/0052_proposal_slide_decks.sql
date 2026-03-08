CREATE TABLE `proposal_slide_decks` (
  `id` text PRIMARY KEY NOT NULL,
  `proposal_id` text NOT NULL REFERENCES `proposals`(`id`) ON DELETE CASCADE,
  `tenant_id` text NOT NULL REFERENCES `tenants`(`id`),
  `format` text NOT NULL DEFAULT 'pitch',
  `title` text NOT NULL,
  `slides` text NOT NULL DEFAULT '[]',
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  `updated_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX `idx_slide_decks_proposal` ON `proposal_slide_decks` (`proposal_id`);
--> statement-breakpoint
CREATE INDEX `idx_slide_decks_tenant` ON `proposal_slide_decks` (`tenant_id`);
