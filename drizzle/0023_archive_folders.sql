-- F22: Archive Folders
-- 2 tables + 5 indexes

CREATE TABLE `archive_folders` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL REFERENCES `tenants`(`id`),
  `name` text NOT NULL,
  `icon` text DEFAULT 'folder',
  `sort_order` integer NOT NULL DEFAULT 0,
  `created_by` text NOT NULL REFERENCES `users`(`id`),
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  `updated_at` integer NOT NULL DEFAULT (unixepoch())
);--> statement-breakpoint
CREATE TABLE `archive_folder_items` (
  `id` text PRIMARY KEY NOT NULL,
  `folder_id` text NOT NULL REFERENCES `archive_folders`(`id`) ON DELETE CASCADE,
  `item_type` text NOT NULL,
  `item_id` text NOT NULL,
  `added_by` text NOT NULL REFERENCES `users`(`id`),
  `added_at` integer NOT NULL DEFAULT (unixepoch())
);--> statement-breakpoint
CREATE INDEX `idx_archive_folders_tenant` ON `archive_folders` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_archive_folders_tenant_order` ON `archive_folders` (`tenant_id`, `sort_order`);--> statement-breakpoint
CREATE INDEX `idx_folder_items_folder` ON `archive_folder_items` (`folder_id`);--> statement-breakpoint
CREATE INDEX `idx_folder_items_type_id` ON `archive_folder_items` (`item_type`, `item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_folder_items` ON `archive_folder_items` (`folder_id`, `item_type`, `item_id`);
