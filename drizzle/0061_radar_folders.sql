-- 0061: Radar 커스텀 폴더 (F41 채널 관리 Phase 2)
-- 도메인과 독립된 사용자 정의 그룹핑

-- 1. radar_folders
CREATE TABLE radar_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  tenant_id TEXT REFERENCES tenants(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(name, tenant_id)
);--> statement-breakpoint

CREATE INDEX idx_radar_folders_tenant ON radar_folders(tenant_id);--> statement-breakpoint

-- 2. radar_source_folders (M:N)
CREATE TABLE radar_source_folders (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES radar_sources(id),
  folder_id TEXT NOT NULL REFERENCES radar_folders(id),
  UNIQUE(source_id, folder_id)
);--> statement-breakpoint

CREATE INDEX idx_rsf_source ON radar_source_folders(source_id);--> statement-breakpoint
CREATE INDEX idx_rsf_folder ON radar_source_folders(folder_id);
