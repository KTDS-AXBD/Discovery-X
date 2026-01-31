import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
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

  return drizzle(sqlite, { schema });
}

export type TestDB = ReturnType<typeof createTestDb>;
