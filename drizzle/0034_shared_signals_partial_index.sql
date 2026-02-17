-- PRD v3 §5.2: shared_signals 부분 인덱스 (topic_id IS NOT NULL일 때만)
-- 기존 전체 인덱스 제거 후 부분 인덱스로 교체
DROP INDEX IF EXISTS idx_shared_signals_topic;
CREATE INDEX idx_shared_signals_topic ON shared_signals(topic_id) WHERE topic_id IS NOT NULL;
