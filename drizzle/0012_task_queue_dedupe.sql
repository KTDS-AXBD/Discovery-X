-- Task Queue Idempotency: dedupe_key 컬럼 추가
-- 중복 enqueue 방지를 위한 키 (nullable)

ALTER TABLE `vd_task_queue` ADD COLUMN `dedupe_key` TEXT;
