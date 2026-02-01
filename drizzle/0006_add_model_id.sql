-- Add model_id column to agent_config for configurable Claude model
ALTER TABLE agent_config ADD COLUMN model_id TEXT;
