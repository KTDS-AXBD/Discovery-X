-- ============================================================================
-- F41 Phase 2: Radar Channel Management
-- 1. radar_domains — 도메인 분류 마스터
-- 2. radar_source_domains — 채널 ↔ 도메인 M:N
-- 3. radar_crawl_queue — 수집 큐
-- 4. enabled → status 정합성 보정
-- ============================================================================

-- 1. radar_domains
CREATE TABLE radar_domains (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  tenant_id TEXT REFERENCES tenants(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(name, tenant_id)
);--> statement-breakpoint

CREATE INDEX idx_radar_domains_tenant ON radar_domains(tenant_id);--> statement-breakpoint

-- 2. radar_source_domains
CREATE TABLE radar_source_domains (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES radar_sources(id),
  domain_id TEXT NOT NULL REFERENCES radar_domains(id),
  UNIQUE(source_id, domain_id)
);--> statement-breakpoint

CREATE INDEX idx_rsd_source ON radar_source_domains(source_id);--> statement-breakpoint
CREATE INDEX idx_rsd_domain ON radar_source_domains(domain_id);--> statement-breakpoint

-- 3. radar_crawl_queue
CREATE TABLE radar_crawl_queue (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES radar_sources(id),
  url TEXT NOT NULL,
  dedupe_key TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  priority INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  parser_type TEXT DEFAULT 'html',
  failure_code TEXT,
  error TEXT,
  batch_id TEXT,
  items_created INTEGER DEFAULT 0,
  tenant_id TEXT REFERENCES tenants(id),
  scheduled_at INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER,
  next_retry_at INTEGER
);--> statement-breakpoint

CREATE INDEX idx_rcq_status ON radar_crawl_queue(status);--> statement-breakpoint
CREATE INDEX idx_rcq_source ON radar_crawl_queue(source_id);--> statement-breakpoint
CREATE INDEX idx_rcq_scheduled ON radar_crawl_queue(scheduled_at);--> statement-breakpoint
CREATE INDEX idx_rcq_tenant ON radar_crawl_queue(tenant_id);--> statement-breakpoint
CREATE INDEX idx_rcq_batch ON radar_crawl_queue(batch_id);--> statement-breakpoint

-- 4. enabled → status 정합성 보정 (Phase 1A 이전 데이터)
UPDATE radar_sources SET status = 'PAUSED' WHERE enabled = 0 AND status = 'ACTIVE';
