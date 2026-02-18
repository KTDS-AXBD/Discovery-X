-- consensus_scores: signalCount + confirmedAt 컬럼 추가
-- 세션 201에서 Drizzle 스키마에 추가되었으나 마이그레이션 누락
ALTER TABLE `consensus_scores` ADD COLUMN `signal_count` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `consensus_scores` ADD COLUMN `confirmed_at` integer;
