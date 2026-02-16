import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import * as v2Schema from "~/db/schema-v2";
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

  return drizzle(sqlite, { schema: { ...schema, ...v2Schema } });
}

export type TestDB = ReturnType<typeof createTestDb>;
