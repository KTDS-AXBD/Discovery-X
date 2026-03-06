-- 작업계획 자동화: Agent 실행 추적 + work_plans 확장
-- work_plan_runs: step별 Agent 코드 생성 이력

CREATE TABLE IF NOT EXISTS work_plan_runs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  work_plan_id TEXT NOT NULL REFERENCES work_plans(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed')),
  agent_input TEXT,
  agent_output TEXT,
  model_id TEXT,
  token_usage INTEGER DEFAULT 0,
  error_message TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER
);
--> statement-breakpoint
CREATE INDEX idx_work_plan_runs_plan ON work_plan_runs(work_plan_id);
--> statement-breakpoint
CREATE INDEX idx_work_plan_runs_status ON work_plan_runs(status);
--> statement-breakpoint

-- work_plans 확장: 진행률 + 시작/완료 시각
ALTER TABLE work_plans ADD COLUMN progress INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE work_plans ADD COLUMN started_at INTEGER;
--> statement-breakpoint
ALTER TABLE work_plans ADD COLUMN completed_at INTEGER;
