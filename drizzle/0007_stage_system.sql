-- ============================================================================
-- 0007: Stage System — 6-상태 → 11단계 파이프라인 전환
-- ============================================================================

-- 1) stages 테이블 생성
CREATE TABLE IF NOT EXISTS `stages` (
  `id` text PRIMARY KEY NOT NULL,
  `name_ko` text NOT NULL,
  `description` text,
  `category` text NOT NULL,
  `order_index` integer NOT NULL,
  `required_fields` text,
  `color` text NOT NULL
);

-- 2) signal_metadata 테이블 생성
CREATE TABLE IF NOT EXISTS `signal_metadata` (
  `discovery_id` text PRIMARY KEY NOT NULL REFERENCES `discoveries`(`id`) ON DELETE CASCADE,
  `signal_type` text,
  `time_sensitivity` text,
  `actors` text,
  `assumptions` text
);

-- 3) discoveries에 stage_updated_at 컬럼 추가
ALTER TABLE `discoveries` ADD COLUMN `stage_updated_at` integer;

-- 4) evidence에 v3 확장 컬럼 추가
ALTER TABLE `evidence` ADD COLUMN `reliability_label` text DEFAULT 'reported';
ALTER TABLE `evidence` ADD COLUMN `source_url` text;
ALTER TABLE `evidence` ADD COLUMN `published_or_observed_date` text;
ALTER TABLE `evidence` ADD COLUMN `validator_id` text;
ALTER TABLE `evidence` ADD COLUMN `validated_at` integer;

-- 5) 기존 6-상태 → 11단계 데이터 마이그레이션
UPDATE `discoveries` SET `status` = 'DISCOVERY' WHERE `status` = 'INBOX';
UPDATE `discoveries` SET `status` = 'IDEA_CARD' WHERE `status` = 'OPEN';
UPDATE `discoveries` SET `status` = 'GATE1' WHERE `status` = 'NEXT';
UPDATE `discoveries` SET `status` = 'HOLD' WHERE `status` = 'NOT_NOW';
UPDATE `discoveries` SET `status` = 'DROP' WHERE `status` = 'DEAD_END';
UPDATE `discoveries` SET `status` = 'IDEA_CARD' WHERE `status` = 'EXTENSION_REQUESTED';

-- 6) 기존 Evidence에 기본 reliability_label 설정
UPDATE `evidence` SET `reliability_label` = 'reported' WHERE `reliability_label` IS NULL;

-- 7) stages 시드 데이터 (11단계)
INSERT INTO `stages` (`id`, `name_ko`, `description`, `category`, `order_index`, `required_fields`, `color`) VALUES
  ('DISCOVERY', '발견', '새로운 신호/관찰을 포착한 초기 상태', 'ideation', 1, '["title","seedSummary","sourceType"]', '#6B7280'),
  ('IDEA_CARD', '아이디어 카드', '신호를 구조화하여 탐색 가능한 아이디어로 정리', 'ideation', 2, '["ownerId","seedSummary"]', '#3B82F6'),
  ('HYPOTHESIS', '가설 수립', '검증 가능한 가설과 실험 설계', 'validation', 3, '["hypothesis","minimalAction","expectedEvidence"]', '#8B5CF6'),
  ('EXPERIMENT', '실험 수행', '설계된 실험을 실행하고 데이터 수집', 'validation', 4, '["experimentId"]', '#F59E0B'),
  ('EVIDENCE_REVIEW', '근거 검토', '수집된 근거의 신뢰도와 충분성 평가', 'validation', 5, '["reliabilityLabel","sourceUrl"]', '#10B981'),
  ('GATE1', 'Gate 1', '실행 진입 의사결정 (Go/No-Go)', 'execution', 6, '["decisionRationale","evidenceSummary"]', '#EF4444'),
  ('SPRINT', '스프린트', '승인된 아이디어의 실행 단계', 'execution', 7, '["sprintGoal"]', '#F97316'),
  ('GATE2', 'Gate 2', '핸드오프 준비 완료 여부 검증', 'execution', 8, '["handoffReadiness"]', '#EC4899'),
  ('HANDOFF', '핸드오프', '정식 프로젝트/프로세스로 이관', 'execution', 9, '["handoffTarget"]', '#14B8A6'),
  ('HOLD', '보류', '조건부 대기 (트리거 조건 + 재검토일 필수)', 'terminal', 10, '["notNowTriggerType","revisitDate"]', '#9CA3AF'),
  ('DROP', '중단', '실패 패턴 태깅 후 종료 (조직 학습 자산)', 'terminal', 11, '["deadEndFailurePattern","deadEndEvidenceReason"]', '#DC2626');
