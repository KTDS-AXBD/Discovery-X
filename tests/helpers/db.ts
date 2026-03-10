import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db";
import * as v2Schema from "~/db/schema-v2";
import * as matrixSchema from "~/features/matrix/db/schema";
import * as requestsSchema from "~/features/requests/db/schema";
import * as topicSchema from "~/features/topic/db/schema";
import * as costSchema from "~/features/cost/db/schema";
import { readFileSync } from "fs";
import { resolve } from "path";

function runMigrationSQL(sqlite: Database.Database, filePath: string) {
  const sql = readFileSync(filePath, "utf-8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    sqlite.exec(stmt);
  }
}

export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const migrationsDir = resolve(__dirname, "../../drizzle");
  runMigrationSQL(sqlite, resolve(migrationsDir, "0000_rare_raider.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0001_magenta_wallflower.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0002_add_approval_columns.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0003_add_fts5.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0004_add_radar_tables.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0005_add_agent_chat_tables.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0006_add_model_id.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0007_stage_system.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0008_method_packs.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0009_google_auth.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0009_ontology_graph.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0010_r3_indicators_connectors.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0011_venture_sprint.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0012_task_queue_dedupe.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0013_embeddings.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0014_add_discovery_tags.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0015_industry_adapters.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0016_decision_logs_assets.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0017_shadow_mode.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0018_valueup_engine.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0019_multi_tenant.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0020_bd_poc_refactoring.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0021_proposals.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0022_ideas_memo.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0023_archive_folders.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0024_proposal_section_unique.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0025_ontology_auto_extract.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0026_dashboard_reaction.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0027_ideas_workspace.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0028_proposal_redesign.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0029_token_usage_logs.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0030_v2_graph_layer.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0031_acl_audit_memory_indexes.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0032_collab_worker_tables.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0033_token_usage_enrich.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0034_shared_signals_partial_index.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0035_token_usage_userid.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0036_framework_matrix.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0037_framework_seed.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0038_matrix_indexes.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0039_consensus_enrich.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0040_graph_approve_reject.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0041_ai_pipeline.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0042_ai_provider_fallback.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0043_feature_requests.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0044_user_onboarding.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0045_requirements_review.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0046_feature_requests_status_check.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0047_work_plan_automation.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0048_drop_signal_metadata.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0049_evidence_conversation_id.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0050_requirements_governance.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0051_status_check_lifecycle.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0052_proposal_slide_decks.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0053_mvp_builds.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0055_radar_manual_collection.sql"));
  runMigrationSQL(sqlite, resolve(migrationsDir, "0054_cost_management.sql"));

  return drizzle(sqlite, { schema: { ...schema, ...v2Schema, ...matrixSchema, ...requestsSchema, ...topicSchema, ...costSchema } });
}

export type TestDB = ReturnType<typeof createTestDb>;
