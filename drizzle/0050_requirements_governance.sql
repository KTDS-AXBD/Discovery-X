-- 0050: 요구사항 표준체계 정렬 — 분류/우선순위/SPEC 연동 필드 + 개발 라이프사이클 상태
ALTER TABLE feature_requests ADD COLUMN req_code TEXT;
ALTER TABLE feature_requests ADD COLUMN type TEXT DEFAULT 'feature';
ALTER TABLE feature_requests ADD COLUMN domain TEXT;
ALTER TABLE feature_requests ADD COLUMN impact_level TEXT;
ALTER TABLE feature_requests ADD COLUMN urgency_level TEXT;
ALTER TABLE feature_requests ADD COLUMN spec_item_id TEXT;
ALTER TABLE feature_requests ADD COLUMN milestone_version TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_feature_requests_req_code ON feature_requests(req_code);
