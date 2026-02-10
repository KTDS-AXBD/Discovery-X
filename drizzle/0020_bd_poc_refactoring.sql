-- BD팀 PoC 리팩토링: 기존 테이블 확장 + 신규 테이블
-- FR-01: radarSources 사용자별 소스
ALTER TABLE radar_sources ADD COLUMN user_id TEXT REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE radar_sources ADD COLUMN keywords TEXT DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE radar_sources ADD COLUMN radar_tags TEXT DEFAULT '[]';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_radar_sources_user_id ON radar_sources(user_id);
--> statement-breakpoint
-- FR-03: radarItems 핵심 포인트 + Embedding
ALTER TABLE radar_items ADD COLUMN key_points TEXT DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE radar_items ADD COLUMN embedding_updated_at INTEGER;
--> statement-breakpoint
-- FR-02: 사용자별 소스 열람 상태
CREATE TABLE IF NOT EXISTS radar_item_user_status (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  item_id TEXT NOT NULL REFERENCES radar_items(id),
  status TEXT NOT NULL DEFAULT 'new',
  viewed_at INTEGER,
  archived_at INTEGER,
  tenant_id TEXT REFERENCES tenants(id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_rius_user_item ON radar_item_user_status(user_id, item_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_rius_status ON radar_item_user_status(status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_rius_tenant ON radar_item_user_status(tenant_id);
--> statement-breakpoint
-- FR-04: conversations 소스 연결
ALTER TABLE conversations ADD COLUMN source_item_id TEXT REFERENCES radar_items(id);
--> statement-breakpoint
-- FR-07, FR-09: discoveries 아이디어 템플릿 + 후보 그룹
ALTER TABLE discoveries ADD COLUMN target_segment TEXT;
--> statement-breakpoint
ALTER TABLE discoveries ADD COLUMN value_proposition TEXT;
--> statement-breakpoint
ALTER TABLE discoveries ADD COLUMN candidate_group_id TEXT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_discoveries_candidate_group ON discoveries(candidate_group_id);
