-- ============================================================================
-- 0009: Ontology Graph — 맥락 그래프 + 근거 중복 감지 (v3 R2)
-- ============================================================================

-- 1) ontology_types 테이블
CREATE TABLE IF NOT EXISTS `ontology_types` (
  `id` text PRIMARY KEY NOT NULL,
  `name_ko` text NOT NULL,
  `domain` text NOT NULL,
  `icon` text,
  `color` text NOT NULL
);

-- 2) context_nodes 테이블
CREATE TABLE IF NOT EXISTS `context_nodes` (
  `id` text PRIMARY KEY NOT NULL,
  `discovery_id` text NOT NULL REFERENCES `discoveries`(`id`) ON DELETE CASCADE,
  `label` text NOT NULL,
  `ontology_type_id` text REFERENCES `ontology_types`(`id`),
  `source_evidence_id` text REFERENCES `evidence`(`id`) ON DELETE SET NULL,
  `metadata` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS `idx_context_nodes_discovery_id` ON `context_nodes`(`discovery_id`);
CREATE INDEX IF NOT EXISTS `idx_context_nodes_ontology_type` ON `context_nodes`(`ontology_type_id`);
CREATE INDEX IF NOT EXISTS `idx_context_nodes_source_evidence` ON `context_nodes`(`source_evidence_id`);

-- 3) context_edges 테이블
CREATE TABLE IF NOT EXISTS `context_edges` (
  `id` text PRIMARY KEY NOT NULL,
  `from_node_id` text NOT NULL REFERENCES `context_nodes`(`id`) ON DELETE CASCADE,
  `to_node_id` text NOT NULL REFERENCES `context_nodes`(`id`) ON DELETE CASCADE,
  `relation_type` text NOT NULL,
  `strength` integer DEFAULT 100,
  `source_evidence_id` text REFERENCES `evidence`(`id`) ON DELETE SET NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS `idx_context_edges_from_node` ON `context_edges`(`from_node_id`);
CREATE INDEX IF NOT EXISTS `idx_context_edges_to_node` ON `context_edges`(`to_node_id`);
CREATE INDEX IF NOT EXISTS `idx_context_edges_source_evidence` ON `context_edges`(`source_evidence_id`);

-- 4) context_snapshots 테이블
CREATE TABLE IF NOT EXISTS `context_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `discovery_id` text NOT NULL REFERENCES `discoveries`(`id`) ON DELETE CASCADE,
  `stage` text NOT NULL,
  `snapshot_data` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS `idx_context_snapshots_discovery_id` ON `context_snapshots`(`discovery_id`);

-- 5) evidence_duplicate_candidates 테이블
CREATE TABLE IF NOT EXISTS `evidence_duplicate_candidates` (
  `id` text PRIMARY KEY NOT NULL,
  `evidence_id_1` text NOT NULL REFERENCES `evidence`(`id`) ON DELETE CASCADE,
  `evidence_id_2` text NOT NULL REFERENCES `evidence`(`id`) ON DELETE CASCADE,
  `similarity_score` integer NOT NULL,
  `reason` text,
  `reviewed` integer NOT NULL DEFAULT 0,
  `reviewed_at` integer,
  `reviewed_by` text REFERENCES `users`(`id`),
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS `idx_evidence_dup_evidence_id_1` ON `evidence_duplicate_candidates`(`evidence_id_1`);
CREATE INDEX IF NOT EXISTS `idx_evidence_dup_evidence_id_2` ON `evidence_duplicate_candidates`(`evidence_id_2`);
CREATE INDEX IF NOT EXISTS `idx_evidence_dup_reviewed` ON `evidence_duplicate_candidates`(`reviewed`);

-- 6) 온톨로지 타입 10종 시드 데이터
INSERT INTO `ontology_types` (`id`, `name_ko`, `domain`, `icon`, `color`) VALUES
  ('ONT-01', '고객 세그먼트', 'customer', '👤', '#3B82F6'),
  ('ONT-02', '시장 트렌드', 'market', '📈', '#10B981'),
  ('ONT-03', '전략 요소', 'strategy', '🎯', '#8B5CF6'),
  ('ONT-04', '경쟁자', 'competition', '⚔️', '#EF4444'),
  ('ONT-05', '생태계 파트너', 'ecosystem', '🌐', '#06B6D4'),
  ('ONT-06', '리스크 요인', 'risk', '⚠️', '#F59E0B'),
  ('ONT-07', '비즈니스 모델', 'business', '💼', '#6366F1'),
  ('ONT-08', '핵심 가정', 'assumption', '💡', '#EC4899'),
  ('ONT-09', '의사결정', 'decision', '🔑', '#14B8A6'),
  ('ONT-10', '기술 요소', 'ecosystem', '🔧', '#78716C');
