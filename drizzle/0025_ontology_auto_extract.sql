-- Phase 1: 온톨로지 자동 추출 지원

-- evidence: 추출 추적
ALTER TABLE evidence ADD COLUMN ontology_extracted_at INTEGER;

-- contextNodes: 글로벌 엔티티 + 자동생성 메타
ALTER TABLE context_nodes ADD COLUMN global_entity_id TEXT;
ALTER TABLE context_nodes ADD COLUMN confidence REAL DEFAULT 1.0;
ALTER TABLE context_nodes ADD COLUMN auto_generated INTEGER DEFAULT 0;
ALTER TABLE context_nodes ADD COLUMN reviewed INTEGER DEFAULT 0;
CREATE INDEX idx_context_nodes_global_entity ON context_nodes(global_entity_id);

-- contextEdges: 자동생성 메타
ALTER TABLE context_edges ADD COLUMN confidence REAL DEFAULT 1.0;
ALTER TABLE context_edges ADD COLUMN auto_generated INTEGER DEFAULT 0;
ALTER TABLE context_edges ADD COLUMN reviewed INTEGER DEFAULT 0;
