-- ============================================================================
-- SEED: 46 sample proposals for Discovery-X
-- Distribution: PROPOSAL(8), FORMALIZATION(2), VALIDATION(0), COMPLETED(1), CLOSED(35)
-- Categories: Physical AI(10), 헬스케어(8), Fintech(8), 교육(7), 커머스(6), B2B SaaS(7)
-- ============================================================================

-- PROPOSAL (8건) — Physical AI(2), 헬스케어(1), Fintech(1), 교육(1), 커머스(1), B2B SaaS(2)
INSERT INTO proposals (id, tenant_id, title, description, status, category, owner_id, like_count, comment_count, created_at, updated_at)
VALUES
('prop-001', 'default-tenant', '사내 문서 기반 의사결정 이유 생성기', '기존 사내 문서(회의록, 보고서, 메모)를 분석하여 특정 의사결정의 근거와 배경을 자동으로 생성하는 AI 시스템', 'PROPOSAL', 'B2B SaaS', 'user-1', 12, 3, unixepoch()-86400*5, unixepoch()-86400*2),
('prop-002', 'default-tenant', 'RFP 자동 대응 생성 플랫폼', '고객사 RFP 문서를 분석하고 과거 제안서 데이터를 활용하여 자동으로 대응 초안을 생성하는 플랫폼', 'PROPOSAL', 'B2B SaaS', 'user-2', 8, 5, unixepoch()-86400*7, unixepoch()-86400*1),
('prop-003', 'default-tenant', '사내 프롬프트 자산화 플랫폼', '조직 내 LLM 프롬프트를 수집, 버전 관리, 공유하는 자산화 플랫폼으로 프롬프트 엔지니어링 역량 축적', 'PROPOSAL', 'Physical AI', 'user-3', 15, 7, unixepoch()-86400*3, unixepoch()-86400*1),
('prop-004', 'default-tenant', '레거시 시스템 설명서 자동 생성 에이전트', '구형 코드베이스를 분석하여 기술 문서, API 문서, 아키텍처 다이어그램을 자동 생성하는 AI 에이전트', 'PROPOSAL', 'Physical AI', 'user-4', 6, 2, unixepoch()-86400*10, unixepoch()-86400*3),
('prop-005', 'default-tenant', '현장 작업 표준서 자동 생성 에이전트', '제조/건설 현장의 작업 절차를 촬영 영상과 센서 데이터로부터 자동으로 표준 작업 절차서를 생성', 'PROPOSAL', 'Physical AI', 'user-5', 9, 4, unixepoch()-86400*6, unixepoch()-86400*2),
('prop-006', 'default-tenant', '고장 원인 및 가설 생성 AI', '제조 설비 고장 데이터와 정비 이력을 학습하여 고장 원인 가설을 자동 생성하고 우선순위를 제안', 'PROPOSAL', 'Physical AI', 'user-1', 11, 6, unixepoch()-86400*4, unixepoch()-86400*1),
('prop-007', 'default-tenant', '신용 심사 결과 설명 생성 AI', '신용 심사 모델의 판단 근거를 고객과 심사역이 이해할 수 있는 자연어 설명으로 변환', 'PROPOSAL', 'Fintech', 'user-2', 7, 3, unixepoch()-86400*8, unixepoch()-86400*4),
('prop-008', 'default-tenant', '부모용 자녀 성장 리포트 생성 AI', '교육 앱 학습 데이터를 기반으로 주간/월간 성장 리포트를 부모 맞춤형으로 자동 생성', 'PROPOSAL', '교육', 'user-3', 14, 8, unixepoch()-86400*2, unixepoch()-86400*0);

-- FORMALIZATION (2건) — 헬스케어(1), 커머스(1)
INSERT INTO proposals (id, tenant_id, title, description, status, category, owner_id, like_count, comment_count, created_at, updated_at)
VALUES
('prop-009', 'default-tenant', '환자 증상 기반 진료과 추천 AI', '환자가 입력한 증상 정보를 분석하여 적합한 진료과와 예상 질환을 안내하는 AI 트리아지 시스템', 'FORMALIZATION', '헬스케어', 'user-4', 18, 9, unixepoch()-86400*15, unixepoch()-86400*5),
('prop-010', 'default-tenant', '라이브 커머스 멘트 실시간 생성 AI', '라이브 방송 중 제품 특성과 시청자 반응을 분석하여 판매자에게 실시간 멘트를 제안하는 AI', 'FORMALIZATION', '커머스', 'user-5', 22, 11, unixepoch()-86400*12, unixepoch()-86400*3);

-- COMPLETED (1건) — Fintech
INSERT INTO proposals (id, tenant_id, title, description, status, category, owner_id, like_count, comment_count, created_at, updated_at)
VALUES
('prop-011', 'default-tenant', '사내 퇴직연금 AI 어드바이저', '퇴직연금 가입자의 투자 성향과 시장 상황을 분석하여 포트폴리오 리밸런싱을 제안하는 AI 시스템', 'COMPLETED', 'Fintech', 'user-1', 25, 14, unixepoch()-86400*45, unixepoch()-86400*7);

-- CLOSED (35건) — HOLD 15건 + DROP 20건
-- HOLD (15건)
INSERT INTO proposals (id, tenant_id, title, description, status, category, close_type, owner_id, like_count, comment_count, created_at, updated_at)
VALUES
('prop-012', 'default-tenant', '시각적 데이터 해석 및 스토리 생성기', '차트/그래프 이미지를 분석하여 비전문가도 이해할 수 있는 데이터 스토리를 자동 생성', 'CLOSED', 'B2B SaaS', 'HOLD', 'user-2', 10, 4, unixepoch()-86400*40, unixepoch()-86400*20),
('prop-013', 'default-tenant', '비즈니스 프로세스 최적화 보고서 생성기', '업무 프로세스 로그를 분석하여 병목 구간과 개선 방안을 자동으로 보고서 형태로 생성', 'CLOSED', 'B2B SaaS', 'HOLD', 'user-3', 8, 3, unixepoch()-86400*35, unixepoch()-86400*18),
('prop-014', 'default-tenant', '고객 피드백 분석 및 인사이트 제공 AI', 'VOC, 리뷰, CS 로그를 통합 분석하여 핵심 이슈와 개선 인사이트를 자동 추출', 'CLOSED', '커머스', 'HOLD', 'user-4', 13, 6, unixepoch()-86400*38, unixepoch()-86400*15),
('prop-015', 'default-tenant', '임상시험 프로토콜 자동 초안 생성', '유사 임상시험 데이터를 학습하여 신규 임상시험 프로토콜 초안을 자동 생성', 'CLOSED', '헬스케어', 'HOLD', 'user-5', 7, 2, unixepoch()-86400*42, unixepoch()-86400*22),
('prop-016', 'default-tenant', '교육과정 커리큘럼 자동 설계 AI', '학습 목표와 대상 수준을 입력하면 최적의 커리큘럼과 학습 경로를 자동 설계', 'CLOSED', '교육', 'HOLD', 'user-1', 11, 5, unixepoch()-86400*36, unixepoch()-86400*19),
('prop-017', 'default-tenant', '보험 약관 요약 및 비교 AI', '복잡한 보험 약관을 쉬운 언어로 요약하고 타사 상품과 주요 조건을 자동 비교', 'CLOSED', 'Fintech', 'HOLD', 'user-2', 9, 4, unixepoch()-86400*33, unixepoch()-86400*16),
('prop-018', 'default-tenant', '스마트 팩토리 예지정비 AI', 'IoT 센서 데이터를 실시간 분석하여 설비 고장을 사전 예측하고 정비 일정을 최적화', 'CLOSED', 'Physical AI', 'HOLD', 'user-3', 16, 8, unixepoch()-86400*44, unixepoch()-86400*25),
('prop-019', 'default-tenant', '상품 리뷰 자동 요약 및 감성 분석', '대량의 상품 리뷰를 요약하고 긍정/부정/중립 감성을 분석하여 판매자에게 인사이트 제공', 'CLOSED', '커머스', 'HOLD', 'user-4', 12, 5, unixepoch()-86400*30, unixepoch()-86400*14),
('prop-020', 'default-tenant', '의료 영상 소견서 초안 생성 AI', 'X-ray, CT 등 의료 영상을 분석하여 방사선과 전문의를 위한 소견서 초안을 자동 생성', 'CLOSED', '헬스케어', 'HOLD', 'user-5', 19, 10, unixepoch()-86400*46, unixepoch()-86400*28),
('prop-021', 'default-tenant', '학생 맞춤형 문제 자동 생성 AI', '학생의 학습 이력과 취약점을 분석하여 개인화된 연습 문제를 자동 생성', 'CLOSED', '교육', 'HOLD', 'user-1', 14, 7, unixepoch()-86400*28, unixepoch()-86400*12),
('prop-022', 'default-tenant', '자율주행 시나리오 자동 생성 시뮬레이터', '실제 도로 데이터를 기반으로 자율주행 테스트 시나리오를 자동 생성하는 시뮬레이션 플랫폼', 'CLOSED', 'Physical AI', 'HOLD', 'user-2', 20, 12, unixepoch()-86400*50, unixepoch()-86400*30),
('prop-023', 'default-tenant', '실시간 환율 예측 및 헤징 어드바이저', '글로벌 뉴스와 경제 지표를 분석하여 환율 변동을 예측하고 최적 헤징 전략을 제안', 'CLOSED', 'Fintech', 'HOLD', 'user-3', 6, 2, unixepoch()-86400*32, unixepoch()-86400*17),
('prop-024', 'default-tenant', '개인화 쇼핑 큐레이션 AI', '고객 행동 패턴과 선호도를 학습하여 초개인화 상품 큐레이션 피드를 실시간 생성', 'CLOSED', '커머스', 'HOLD', 'user-4', 15, 8, unixepoch()-86400*29, unixepoch()-86400*13),
('prop-025', 'default-tenant', '특허 선행기술 자동 조사 AI', '특허 출원 전 선행기술을 자동 조사하고 특허성 판단에 필요한 분석 보고서를 생성', 'CLOSED', 'B2B SaaS', 'HOLD', 'user-5', 11, 5, unixepoch()-86400*37, unixepoch()-86400*21),
('prop-026', 'default-tenant', '약물 상호작용 예측 AI', '복수 약물 투여 시 상호작용과 부작용 가능성을 예측하여 의료진에게 경고를 제공', 'CLOSED', '헬스케어', 'HOLD', 'user-1', 17, 9, unixepoch()-86400*41, unixepoch()-86400*23);

-- DROP (20건)
INSERT INTO proposals (id, tenant_id, title, description, status, category, close_type, owner_id, like_count, comment_count, created_at, updated_at)
VALUES
('prop-027', 'default-tenant', '가상 면접관 시뮬레이터', 'AI 면접관이 직무별 맞춤 질문을 생성하고 답변을 분석하여 피드백을 제공하는 면접 연습 시스템', 'CLOSED', '교육', 'DROP', 'user-2', 5, 1, unixepoch()-86400*55, unixepoch()-86400*35),
('prop-028', 'default-tenant', '물류 최적 경로 실시간 추천 AI', '교통, 날씨, 주문량 데이터를 종합 분석하여 배송 차량의 최적 경로를 실시간 추천', 'CLOSED', 'Physical AI', 'DROP', 'user-3', 4, 2, unixepoch()-86400*52, unixepoch()-86400*32),
('prop-029', 'default-tenant', '자동 세무 리포트 생성기', '회계 데이터를 분석하여 세무 신고에 필요한 보고서와 절세 전략을 자동 생성', 'CLOSED', 'Fintech', 'DROP', 'user-4', 3, 1, unixepoch()-86400*48, unixepoch()-86400*28),
('prop-030', 'default-tenant', '증강현실 제품 매뉴얼 AI', 'AR 기술과 AI를 결합하여 제품에 카메라를 비추면 사용법을 실시간 안내하는 시스템', 'CLOSED', 'Physical AI', 'DROP', 'user-5', 7, 3, unixepoch()-86400*54, unixepoch()-86400*34),
('prop-031', 'default-tenant', '소셜 미디어 트렌드 예측 AI', 'SNS 데이터를 실시간 분석하여 향후 트렌드와 바이럴 콘텐츠를 예측', 'CLOSED', '커머스', 'DROP', 'user-1', 6, 2, unixepoch()-86400*50, unixepoch()-86400*30),
('prop-032', 'default-tenant', '자동 논문 리뷰 AI', '학술 논문을 분석하여 구조적 완성도, 논리적 일관성, 인용 적절성을 자동 리뷰', 'CLOSED', '교육', 'DROP', 'user-2', 8, 4, unixepoch()-86400*47, unixepoch()-86400*27),
('prop-033', 'default-tenant', '음성 기반 의료 차트 작성 AI', '의사의 진료 중 음성을 인식하여 자동으로 의료 차트를 작성하는 시스템', 'CLOSED', '헬스케어', 'DROP', 'user-3', 10, 5, unixepoch()-86400*53, unixepoch()-86400*33),
('prop-034', 'default-tenant', '블록체인 기반 디지털 자산 관리 플랫폼', '블록체인 기술을 활용한 디지털 자산(NFT, 토큰) 통합 관리 및 거래 플랫폼', 'CLOSED', 'Fintech', 'DROP', 'user-4', 2, 0, unixepoch()-86400*56, unixepoch()-86400*36),
('prop-035', 'default-tenant', '로봇 프로세스 자동화(RPA) 통합 관리', '기업 내 RPA 봇들을 통합 관리하고 업무 프로세스 자동화 효율을 최적화', 'CLOSED', 'B2B SaaS', 'DROP', 'user-5', 4, 1, unixepoch()-86400*49, unixepoch()-86400*29),
('prop-036', 'default-tenant', '실시간 건물 에너지 최적화 AI', '건물 IoT 센서 데이터를 분석하여 에너지 사용을 실시간 최적화하는 시스템', 'CLOSED', 'Physical AI', 'DROP', 'user-1', 9, 3, unixepoch()-86400*51, unixepoch()-86400*31),
('prop-037', 'default-tenant', '온라인 시험 부정행위 감지 AI', '웹캠과 화면 공유 데이터를 분석하여 온라인 시험 중 부정행위를 실시간 감지', 'CLOSED', '교육', 'DROP', 'user-2', 5, 2, unixepoch()-86400*45, unixepoch()-86400*25),
('prop-038', 'default-tenant', '개인 건강 데이터 통합 대시보드', '웨어러블 디바이스와 의료 기록을 통합하여 개인 건강 상태를 종합 관리하는 대시보드', 'CLOSED', '헬스케어', 'DROP', 'user-3', 11, 6, unixepoch()-86400*43, unixepoch()-86400*23),
('prop-039', 'default-tenant', 'AI 기반 부동산 가치 평가 시스템', '위치, 시세, 개발 계획 등 다양한 데이터를 분석하여 부동산 적정 가치를 자동 산출', 'CLOSED', 'Fintech', 'DROP', 'user-4', 7, 3, unixepoch()-86400*46, unixepoch()-86400*26),
('prop-040', 'default-tenant', '식품 안전 예측 모니터링 AI', '유통 과정의 온도, 습도 등 환경 데이터를 분석하여 식품 안전 위험을 사전 예측', 'CLOSED', '커머스', 'DROP', 'user-5', 3, 1, unixepoch()-86400*52, unixepoch()-86400*32),
('prop-041', 'default-tenant', '회의록 자동 요약 및 액션아이템 추출', '화상회의 녹음을 분석하여 핵심 내용을 요약하고 참석자별 액션아이템을 자동 추출', 'CLOSED', 'B2B SaaS', 'DROP', 'user-1', 13, 7, unixepoch()-86400*39, unixepoch()-86400*19),
('prop-042', 'default-tenant', '드론 기반 농작물 건강 진단 AI', '드론 촬영 이미지를 분석하여 농작물의 병충해와 생육 상태를 자동 진단', 'CLOSED', 'Physical AI', 'DROP', 'user-2', 8, 4, unixepoch()-86400*55, unixepoch()-86400*35),
('prop-043', 'default-tenant', '언어 학습 AI 튜터', '학습자의 수준과 목표에 맞춘 개인화 언어 학습 커리큘럼과 대화 연습을 제공하는 AI 튜터', 'CLOSED', '교육', 'DROP', 'user-3', 16, 9, unixepoch()-86400*40, unixepoch()-86400*20),
('prop-044', 'default-tenant', '의약품 수요 예측 AI', '병원/약국의 의약품 소비 패턴과 질병 발생 추이를 분석하여 수요를 예측', 'CLOSED', '헬스케어', 'DROP', 'user-4', 5, 2, unixepoch()-86400*48, unixepoch()-86400*28),
('prop-045', 'default-tenant', '크라우드 펀딩 성공률 예측 AI', '프로젝트 특성과 시장 트렌드를 분석하여 크라우드 펀딩 캠페인의 성공 가능성을 예측', 'CLOSED', 'Fintech', 'DROP', 'user-5', 4, 1, unixepoch()-86400*44, unixepoch()-86400*24),
('prop-046', 'default-tenant', '공급망 리스크 실시간 모니터링', '글로벌 공급망 데이터를 실시간 분석하여 리스크를 감지하고 대안 공급처를 자동 추천', 'CLOSED', 'Physical AI', 'DROP', 'user-1', 10, 5, unixepoch()-86400*42, unixepoch()-86400*22);
