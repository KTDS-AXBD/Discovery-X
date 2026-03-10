-- 0054: Radar 수동 수집 + Signal→Idea 연결 (DX-REQ-012 Phase 1A)

-- 1. radar_sources 확장
ALTER TABLE radar_sources ADD COLUMN collection_type TEXT DEFAULT 'auto';
ALTER TABLE radar_sources ADD COLUMN status TEXT DEFAULT 'ACTIVE';
ALTER TABLE radar_sources ADD COLUMN crawl_interval INTEGER DEFAULT 86400;
ALTER TABLE radar_sources ADD COLUMN last_collected_at INTEGER;
ALTER TABLE radar_sources ADD COLUMN consecutive_failures INTEGER DEFAULT 0;

-- 2. radar_items 확장
ALTER TABLE radar_items ADD COLUMN content_type TEXT DEFAULT 'article';
ALTER TABLE radar_items ADD COLUMN raw_content TEXT;
ALTER TABLE radar_items ADD COLUMN parsed_content TEXT;
ALTER TABLE radar_items ADD COLUMN excerpt TEXT;
ALTER TABLE radar_items ADD COLUMN item_metadata TEXT;
ALTER TABLE radar_items ADD COLUMN dedupe_key TEXT;

-- 3. idea_sources 확장
ALTER TABLE idea_sources ADD COLUMN link_type TEXT DEFAULT 'primary';
ALTER TABLE idea_sources ADD COLUMN created_by TEXT DEFAULT 'user';

-- 4. 기존 데이터 마이그레이션
UPDATE radar_sources SET source_type = 'site' WHERE source_type = 'web';
UPDATE radar_sources SET collection_type = 'auto' WHERE collection_type IS NULL;
UPDATE radar_sources SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE radar_items SET content_type = 'article' WHERE content_type IS NULL;
UPDATE radar_items SET content_type = 'video'
  WHERE id IN (SELECT ri.id FROM radar_items ri JOIN radar_sources rs ON ri.source_id = rs.id WHERE rs.source_type = 'youtube');
UPDATE idea_sources SET link_type = 'secondary' WHERE link_type IS NULL;
UPDATE idea_sources SET created_by = 'ai-pipeline' WHERE created_by IS NULL;

-- 5. 인덱스
CREATE INDEX IF NOT EXISTS idx_radar_items_content_type ON radar_items(content_type);
CREATE INDEX IF NOT EXISTS idx_radar_items_dedupe_key ON radar_items(dedupe_key);
CREATE INDEX IF NOT EXISTS idx_radar_sources_status ON radar_sources(status);
CREATE INDEX IF NOT EXISTS idx_idea_sources_link_type ON idea_sources(link_type);
