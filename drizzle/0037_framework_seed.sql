-- Framework Master Data Seed (개발/테스트용)
-- 실제 프로덕션 시딩은 matrix.service.ts의 seedMasterData() 사용
--
-- NOTE: team_id를 실제 값으로 교체하여 사용
-- 예: 'axbd' → 실제 tenant team_id

INSERT INTO industries (id, team_id, name, name_en, display_order, strategic_weight, is_active) VALUES
  ('axbd_ind_finance', 'axbd', '금융', 'Finance', 1, 1.5, 1),
  ('axbd_ind_public', 'axbd', '공공', 'Public', 2, 1.3, 1),
  ('axbd_ind_telecom', 'axbd', '통신', 'Telecom', 3, 1.5, 1),
  ('axbd_ind_manufacturing', 'axbd', '제조', 'Manufacturing', 4, 1.2, 1),
  ('axbd_ind_retail', 'axbd', '유통/커머스', 'Retail', 5, 1.0, 1),
  ('axbd_ind_healthcare', 'axbd', '헬스케어', 'Healthcare', 6, 1.0, 0),
  ('axbd_ind_energy', 'axbd', '에너지', 'Energy', 7, 0.8, 0),
  ('axbd_ind_emerging', 'axbd', '전략 신산업', 'Emerging', 8, 1.0, 0);
--> statement-breakpoint

INSERT INTO functions (id, team_id, name, name_en, category, display_order, is_active) VALUES
  ('axbd_fn_finance_accounting', 'axbd', '재무/회계', 'Finance/Accounting', 'sap_based', 1, 1),
  ('axbd_fn_scm', 'axbd', '공급망/물류', 'SCM/Logistics', 'sap_based', 2, 1),
  ('axbd_fn_crm', 'axbd', 'CRM/고객경험', 'CRM/CX', 'sap_based', 3, 1),
  ('axbd_fn_data_analytics', 'axbd', '데이터/분석', 'Data/Analytics', 'hybrid', 4, 1),
  ('axbd_fn_ai_automation', 'axbd', 'AI 자동화', 'AI Automation', 'ai_service', 5, 1),
  ('axbd_fn_ai_process', 'axbd', 'AI 프로세스 혁신', 'AI Process Innovation', 'ai_service', 6, 1),
  ('axbd_fn_hr', 'axbd', 'HR', 'HR', 'sap_based', 7, 0),
  ('axbd_fn_operations', 'axbd', '운영/생산', 'Operations', 'sap_based', 8, 0),
  ('axbd_fn_ai_platform', 'axbd', 'AI 서비스 플랫폼', 'AI Service Platform', 'ai_service', 9, 0);
--> statement-breakpoint

-- 스코어링 초기 설정
INSERT INTO scoring_config (team_id, config_key, config_value, description) VALUES
  ('axbd', 'weight_clevel', 0.4, 'C-Level 스코어 가중치'),
  ('axbd', 'weight_execution', 0.4, 'Execution 스코어 가중치'),
  ('axbd', 'weight_signal', 0.2, '시그널 보정 가중치'),
  ('axbd', 'signal_decay_days', 90, '시그널 보정 감쇠 기준일'),
  ('axbd', 'min_signals_for_adjust', 3, '보정 적용 최소 시그널 수'),
  ('axbd', 'max_signal_adjustment', 2.0, '시그널 보정 최대 절대값'),
  ('axbd', 'apply_industry_weight', 1, '산업 strategic_weight 반영 여부'),
  ('axbd', 'min_voters_for_confirm', 2, '합의 확정 최소 인원'),
  ('axbd', 'deviation_alert_threshold', 1.5, '개별 스코어 표준편차 경고 임계값');
