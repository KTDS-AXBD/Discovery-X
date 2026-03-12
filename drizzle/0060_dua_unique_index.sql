-- 0060: daily_usage_aggregates 복합 유니크 인덱스 추가
-- 동일 (tenant, user, provider, model, purpose, date) 조합의 중복 행 방지

-- Step 1: 기존 중복 데이터 정리 (최신 row만 유지)
DELETE FROM daily_usage_aggregates
WHERE id NOT IN (
  SELECT MAX(id) FROM daily_usage_aggregates
  GROUP BY tenant_id, COALESCE(user_id, ''), provider, model, purpose, date
);

-- Step 2: 유니크 인덱스 생성
CREATE UNIQUE INDEX IF NOT EXISTS idx_dua_tenant_user_provider_model_purpose_date
ON daily_usage_aggregates(tenant_id, COALESCE(user_id, ''), provider, model, purpose, date);
