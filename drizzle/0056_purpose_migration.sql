-- Purpose Migration: token_usage_logs.mode → token_usage_logs.purpose
-- Maps: default→chat, ideas→analysis, direct→extraction

UPDATE token_usage_logs
SET purpose = CASE mode
  WHEN 'default' THEN 'chat'
  WHEN 'ideas' THEN 'analysis'
  WHEN 'direct' THEN 'extraction'
  ELSE 'chat'
END
WHERE purpose IS NULL;
