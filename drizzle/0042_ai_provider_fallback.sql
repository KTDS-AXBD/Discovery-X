-- AI Provider Fallback System
-- agent_config에 프로바이더 상태 저장, token_usage_logs에 프로바이더 필드 추가

ALTER TABLE agent_config ADD COLUMN ai_provider_state TEXT;
--> statement-breakpoint
ALTER TABLE token_usage_logs ADD COLUMN provider TEXT DEFAULT 'anthropic';
