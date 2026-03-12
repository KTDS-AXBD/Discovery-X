-- PRD Studio UNIQUE 제약 추가 (S-P2-2)
-- prd_sections: 동일 PRD에 같은 타입 섹션 중복 방지
-- prd_versions: 동일 PRD에 같은 버전 번호 중복 방지

CREATE UNIQUE INDEX IF NOT EXISTS idx_prd_sections_unique ON prd_sections(prd_id, type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prd_versions_unique ON prd_versions(prd_id, version);
