-- Framework Matrix Tables (P6.0)
-- industries, functions, matrix_cells, individual_scores, consensus_scores, cell_topic_map, scoring_config

CREATE TABLE `industries` (
  `id`               text PRIMARY KEY NOT NULL,
  `team_id`          text NOT NULL,
  `name`             text NOT NULL,
  `name_en`          text,
  `description`      text,
  `display_order`    integer NOT NULL DEFAULT 0,
  `strategic_weight` real NOT NULL DEFAULT 1.0,
  `icon`             text,
  `is_active`        integer NOT NULL DEFAULT 1,
  `created_at`       integer NOT NULL DEFAULT (unixepoch()),
  `updated_at`       integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_industries_team_name` ON `industries`(`team_id`, `name`);
--> statement-breakpoint
CREATE INDEX `idx_industries_team` ON `industries`(`team_id`, `display_order`);
--> statement-breakpoint
CREATE INDEX `idx_industries_active` ON `industries`(`team_id`, `is_active`);
--> statement-breakpoint

CREATE TABLE `functions` (
  `id`               text PRIMARY KEY NOT NULL,
  `team_id`          text NOT NULL,
  `name`             text NOT NULL,
  `name_en`          text,
  `description`      text,
  `category`         text NOT NULL DEFAULT 'sap_based',
  `display_order`    integer NOT NULL DEFAULT 0,
  `is_active`        integer NOT NULL DEFAULT 1,
  `created_at`       integer NOT NULL DEFAULT (unixepoch()),
  `updated_at`       integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_functions_team_name` ON `functions`(`team_id`, `name`);
--> statement-breakpoint
CREATE INDEX `idx_functions_team` ON `functions`(`team_id`, `display_order`);
--> statement-breakpoint
CREATE INDEX `idx_functions_category` ON `functions`(`team_id`, `category`);
--> statement-breakpoint
CREATE INDEX `idx_functions_active` ON `functions`(`team_id`, `is_active`);
--> statement-breakpoint

CREATE TABLE `matrix_cells` (
  `id`                text PRIMARY KEY NOT NULL,
  `team_id`           text NOT NULL,
  `industry_id`       text NOT NULL REFERENCES `industries`(`id`),
  `function_id`       text NOT NULL REFERENCES `functions`(`id`),
  `time_horizon`      text NOT NULL DEFAULT 'short',
  `pipeline_stage`    text NOT NULL DEFAULT 'activity',
  `status`            text NOT NULL DEFAULT 'active',
  `description`       text,
  `revenue_potential` real,
  `revenue_unit`      text DEFAULT 'krw_100m',
  `owner_id`          text,
  `priority`          integer DEFAULT 0,
  `tags`              text,
  `created_by`        text NOT NULL,
  `created_at`        integer NOT NULL DEFAULT (unixepoch()),
  `updated_at`        integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_cells_team_industry_function` ON `matrix_cells`(`team_id`, `industry_id`, `function_id`);
--> statement-breakpoint
CREATE INDEX `idx_cells_team_status` ON `matrix_cells`(`team_id`, `status`);
--> statement-breakpoint
CREATE INDEX `idx_cells_industry` ON `matrix_cells`(`industry_id`);
--> statement-breakpoint
CREATE INDEX `idx_cells_function` ON `matrix_cells`(`function_id`);
--> statement-breakpoint
CREATE INDEX `idx_cells_owner` ON `matrix_cells`(`owner_id`);
--> statement-breakpoint
CREATE INDEX `idx_cells_pipeline_stage` ON `matrix_cells`(`team_id`, `pipeline_stage`);
--> statement-breakpoint

CREATE TABLE `individual_scores` (
  `id`                  integer PRIMARY KEY AUTOINCREMENT,
  `cell_id`             text NOT NULL REFERENCES `matrix_cells`(`id`) ON DELETE CASCADE,
  `scored_by`           text NOT NULL,
  `score_period`        text NOT NULL,
  `strategic_fit`       real NOT NULL DEFAULT 3.0,
  `profitability`       real NOT NULL DEFAULT 3.0,
  `market_scalability`  real NOT NULL DEFAULT 3.0,
  `brand_impact`        real NOT NULL DEFAULT 3.0,
  `roi_expectation`     real NOT NULL DEFAULT 3.0,
  `feasibility`         real NOT NULL DEFAULT 3.0,
  `tech_difficulty`     real NOT NULL DEFAULT 3.0,
  `reference_exists`    real NOT NULL DEFAULT 3.0,
  `resource_available`  real NOT NULL DEFAULT 3.0,
  `risk_level`          real NOT NULL DEFAULT 3.0,
  `clevel_avg`          real,
  `execution_avg`       real,
  `note`                text,
  `created_at`          integer NOT NULL DEFAULT (unixepoch()),
  `updated_at`          integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_indiv_scores_cell_scorer_period` ON `individual_scores`(`cell_id`, `scored_by`, `score_period`);
--> statement-breakpoint
CREATE INDEX `idx_indiv_scores_cell_period` ON `individual_scores`(`cell_id`, `score_period`);
--> statement-breakpoint
CREATE INDEX `idx_indiv_scores_scored_by` ON `individual_scores`(`scored_by`, `score_period`);
--> statement-breakpoint

CREATE TABLE `consensus_scores` (
  `id`                  integer PRIMARY KEY AUTOINCREMENT,
  `cell_id`             text NOT NULL REFERENCES `matrix_cells`(`id`) ON DELETE CASCADE,
  `score_period`        text NOT NULL,
  `clevel_score`        real NOT NULL,
  `execution_score`     real NOT NULL,
  `signal_adjustment`   real NOT NULL DEFAULT 0.0,
  `composite_score`     real NOT NULL,
  `status`              text NOT NULL DEFAULT 'draft',
  `confirmed_by`        text,
  `rationale`           text,
  `participant_count`   integer NOT NULL DEFAULT 0,
  `deviation`           real,
  `prev_composite`      real,
  `created_at`          integer NOT NULL DEFAULT (unixepoch()),
  `updated_at`          integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_consensus_cell_period` ON `consensus_scores`(`cell_id`, `score_period`);
--> statement-breakpoint
CREATE INDEX `idx_consensus_status` ON `consensus_scores`(`status`);
--> statement-breakpoint
CREATE INDEX `idx_consensus_composite_score` ON `consensus_scores`(`composite_score`);
--> statement-breakpoint

CREATE TABLE `cell_topic_map` (
  `cell_id`    text NOT NULL REFERENCES `matrix_cells`(`id`) ON DELETE CASCADE,
  `topic_id`   text NOT NULL,
  `relevance`  real NOT NULL DEFAULT 1.0,
  `linked_by`  text NOT NULL,
  `note`       text,
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (`cell_id`, `topic_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_ctm_topic` ON `cell_topic_map`(`topic_id`);
--> statement-breakpoint

CREATE TABLE `scoring_config` (
  `id`           integer PRIMARY KEY AUTOINCREMENT,
  `team_id`      text NOT NULL,
  `config_key`   text NOT NULL,
  `config_value` real NOT NULL,
  `description`  text,
  `updated_by`   text,
  `updated_at`   integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_scoring_config_team_key` ON `scoring_config`(`team_id`, `config_key`);
