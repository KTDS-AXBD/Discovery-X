-- F49: task_complexity_logs — PAL Router 복잡도 점수 + 티어 선택 + 실행 결과 기록
CREATE TABLE IF NOT EXISTS "task_complexity_logs" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "request_id" TEXT,
  "purpose" TEXT NOT NULL,
  "complexity_score" REAL NOT NULL,
  "tier" TEXT NOT NULL,
  "selected_model" TEXT,
  "selected_provider" TEXT,
  "success" INTEGER,
  "latency_ms" INTEGER,
  "estimated_cost_usd" REAL,
  "escalated_from" TEXT,
  "created_at" INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS "idx_tcl_tenant_created" ON "task_complexity_logs" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_tcl_purpose_tier" ON "task_complexity_logs" ("purpose", "tier");
