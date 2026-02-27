-- ============================================================
-- Discovery-X 프로덕션 데이터 초기화 스크립트
-- 생성일: 2026-02-27
-- 목적: 운영 실험 초기화 — 수집 아이템/아이디어/파이프라인/제안/대화 삭제
-- 유지: 사용자 계정, 소스 구독 설정, 방법론, 공통 설정
-- ============================================================

-- FK 제약 비활성화 (SQLite 배치 실행용)
PRAGMA foreign_keys = OFF;

-- 1. Radar 수집 아이템 (소스 구독 설정은 유지)
DELETE FROM radar_item_user_status;
DELETE FROM radar_items;
DELETE FROM radar_runs;

-- 2. 아이디어 (개인 + 팀)
DELETE FROM idea_sources;
DELETE FROM ideas;

-- 3. Discovery 파이프라인 — 자식 테이블부터 삭제
DELETE FROM evidence_duplicate_candidates;
DELETE FROM signal_metadata;
DELETE FROM evidence;
DELETE FROM experiments;
DELETE FROM event_logs;
-- stages는 파이프라인 단계 정의 테이블 (공통 설정) — 삭제 안 함

-- Discovery 연결 데이터
DELETE FROM decision_logs;
DELETE FROM extracted_patterns;
DELETE FROM reusable_rules;
DELETE FROM gate_packages;
DELETE FROM assumptions;
DELETE FROM gate_approvals;
DELETE FROM kpi_measurements;
DELETE FROM discovery_kpis;
DELETE FROM discovery_links;
DELETE FROM method_runs;

-- 온톨로지/그래프 (Discovery와 연결)
DELETE FROM context_snapshots;
DELETE FROM context_edges;
DELETE FROM context_nodes;

-- v3 Graph Layer
DELETE FROM graph_events;
DELETE FROM projections;
DELETE FROM graphs;

-- Agent 메모리/세션
DELETE FROM agent_memory_v2;
DELETE FROM agent_sessions_v2;

-- Discovery 본체
DELETE FROM discoveries;

-- FTS5 인덱스 재구성
INSERT INTO discoveries_fts(discoveries_fts) VALUES('rebuild');

-- 4. 사업제안 (Proposals)
DELETE FROM proposal_comments;
DELETE FROM proposal_actions;
DELETE FROM proposal_milestones;
DELETE FROM proposal_members;
DELETE FROM proposal_likes;
DELETE FROM proposal_sections;
DELETE FROM proposals;

-- 5. 에이전트 대화 이력
DELETE FROM messages;
DELETE FROM conversations;

-- 6. 시그널
DELETE FROM shared_signals;

-- FK 제약 재활성화
PRAGMA foreign_keys = ON;

-- ============================================================
-- 유지 목록 (삭제 안 함):
--   users, sessions, tenants, tenant_members
--   radar_sources (소스 구독 설정)
--   method_packs, ontology_types
--   industries, functions, matrix_cells, scoring_config (프레임워크)
--   agent_config, webhook_configs, alert_rules
--   topics, topic_members (팀 협업 공간)
--   archive_folders, archive_folder_items
--   proposal_categories
--   token_usage_logs (비용 추적)
--   cron_logs, notification_queue
-- ============================================================
