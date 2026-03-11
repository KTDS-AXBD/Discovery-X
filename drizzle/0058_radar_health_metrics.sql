-- 0058_radar_health_metrics.sql
-- F41 Phase 3A: Health Score + AI 품질 평가 테이블

-- 1. radar_source_metrics — 채널별 일별 건강도 스냅샷
CREATE TABLE IF NOT EXISTS radar_source_metrics (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES radar_sources(id),
  tenant_id TEXT REFERENCES tenants(id),
  date TEXT NOT NULL,
  total_items INTEGER DEFAULT 0,
  new_items_today INTEGER DEFAULT 0,
  total_ideas INTEGER DEFAULT 0,
  viewed_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  dislike_count INTEGER DEFAULT 0,
  conversion_count_7d INTEGER DEFAULT 0,
  conversion_count_30d INTEGER DEFAULT 0,
  avg_relevance REAL DEFAULT 0,
  avg_novelty REAL DEFAULT 0,
  engagement_rate REAL DEFAULT 0,
  conversion_rate_7d REAL DEFAULT 0,
  conversion_rate_30d REAL DEFAULT 0,
  health_score REAL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(source_id, date)
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_rsm_source ON radar_source_metrics(source_id);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_rsm_tenant_date ON radar_source_metrics(tenant_id, date);

--> statement-breakpoint

-- 2. radar_item_metrics — 아이템별 AI 품질 지표
CREATE TABLE IF NOT EXISTS radar_item_metrics (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL UNIQUE REFERENCES radar_items(id),
  tenant_id TEXT REFERENCES tenants(id),
  topic_relevance REAL DEFAULT 0,
  novelty REAL DEFAULT 0,
  quality REAL DEFAULT 0,
  composite_score REAL DEFAULT 0,
  model_version TEXT,
  evaluated_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_rim_item ON radar_item_metrics(item_id);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_rim_tenant ON radar_item_metrics(tenant_id);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_rim_evaluated ON radar_item_metrics(evaluated_at);
