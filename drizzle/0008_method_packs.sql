-- ============================================================================
-- 0008: Method Packs — 방법론 실행 + Gate 패키지 (v3 R1)
-- ============================================================================

-- 1) method_packs 테이블
CREATE TABLE IF NOT EXISTS `method_packs` (
  `id` text PRIMARY KEY NOT NULL,
  `name_ko` text NOT NULL,
  `tier` text NOT NULL,
  `category` text NOT NULL,
  `when_to_use` text,
  `required_inputs` text,
  `output_artifacts` text,
  `score_hooks` text,
  `gate_hooks` text,
  `quick_run` integer NOT NULL DEFAULT 0,
  `timebox` text,
  `evidence_minimum` text,
  `applicable_stages` text,
  `template_prompt` text,
  `output_schema` text
);

-- 2) method_runs 테이블
CREATE TABLE IF NOT EXISTS `method_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `discovery_id` text NOT NULL REFERENCES `discoveries`(`id`) ON DELETE CASCADE,
  `method_pack_id` text NOT NULL REFERENCES `method_packs`(`id`),
  `status` text NOT NULL DEFAULT 'RUNNING',
  `started_at` integer NOT NULL DEFAULT (unixepoch()),
  `completed_at` integer,
  `structured_output` text,
  `evidence_ids` text,
  `executor_id` text REFERENCES `users`(`id`),
  `conversation_id` text REFERENCES `conversations`(`id`)
);
CREATE INDEX IF NOT EXISTS `idx_method_runs_discovery_id` ON `method_runs`(`discovery_id`);
CREATE INDEX IF NOT EXISTS `idx_method_runs_method_pack_id` ON `method_runs`(`method_pack_id`);
CREATE INDEX IF NOT EXISTS `idx_method_runs_status` ON `method_runs`(`status`);

-- 3) gate_packages 테이블
CREATE TABLE IF NOT EXISTS `gate_packages` (
  `id` text PRIMARY KEY NOT NULL,
  `discovery_id` text NOT NULL REFERENCES `discoveries`(`id`) ON DELETE CASCADE,
  `gate_type` text NOT NULL,
  `auto_drafted_at` integer,
  `submitted_at` integer,
  `decided_at` integer,
  `decision` text,
  `rationale` text,
  `scorecard` text,
  `method_run_summary` text,
  `evidence_summary` text,
  `assumptions_json` text,
  `approver_id` text REFERENCES `users`(`id`)
);
CREATE INDEX IF NOT EXISTS `idx_gate_packages_discovery_id` ON `gate_packages`(`discovery_id`);
CREATE INDEX IF NOT EXISTS `idx_gate_packages_gate_type` ON `gate_packages`(`gate_type`);

-- 4) assumptions 테이블
CREATE TABLE IF NOT EXISTS `assumptions` (
  `id` text PRIMARY KEY NOT NULL,
  `discovery_id` text NOT NULL REFERENCES `discoveries`(`id`) ON DELETE CASCADE,
  `statement` text NOT NULL,
  `refutation_questions` text,
  `status` text NOT NULL DEFAULT 'OPEN',
  `evidence_ids` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS `idx_assumptions_discovery_id` ON `assumptions`(`discovery_id`);
CREATE INDEX IF NOT EXISTS `idx_assumptions_status` ON `assumptions`(`status`);

-- 5) 12종 Method Pack 시드 데이터
INSERT INTO `method_packs` (`id`, `name_ko`, `tier`, `category`, `when_to_use`, `required_inputs`, `output_artifacts`, `score_hooks`, `gate_hooks`, `quick_run`, `timebox`, `evidence_minimum`, `applicable_stages`, `template_prompt`, `output_schema`) VALUES
  ('MP-01', 'JTBD + 마찰지도', 'Tier-0', '고객/문제',
   '고객 Pain/VOC 또는 문제 정의가 불명확할 때 (DISCOVERY~IDEA_CARD)',
   'Actor(고객/사용자), 현재 프로세스, 주요 마찰 3개, Evidence 2개',
   'Friction Map, KPI 후보, Assumptions(반증 질문)',
   'Friction→KPI 정의 완료 시 Scorecard의 측정가능성 가점',
   'Gate1 패키지 필수(시장/고객 계열)',
   1, '<=2h (Quick-Run) / <=1d (Full)',
   'Evidence 2개(라벨 포함), VOC/인터뷰 1개 권장',
   '["DISCOVERY","IDEA_CARD"]',
   '다음 JTBD + 마찰지도 분석을 수행합니다.

## 1단계: Actor 정의
고객/사용자는 누구인가요? 현재 프로세스를 설명해주세요.

## 2단계: Jobs-to-be-Done
이 사용자가 달성하려는 핵심 작업(Job)은 무엇인가요?

## 3단계: 마찰 포인트 도출
현재 프로세스에서 주요 마찰(Friction) 3가지를 식별합니다.

## 4단계: KPI 후보 도출
마찰 해소 시 측정 가능한 KPI를 제안합니다.

## 5단계: 가정 및 반증 질문
핵심 가정을 정리하고, 이를 반증할 질문을 도출합니다.',
   '{"frictionMap":{"type":"array","items":{"friction":"string","severity":"string","evidence":"string"}},"kpiCandidates":{"type":"array","items":"string"},"assumptions":{"type":"array","items":{"statement":"string","refutationQuestion":"string"}}}'),

  ('MP-02', '3C + 이슈 트리', 'Tier-0', '전략/구조화',
   '논쟁이 길어지거나 가정이 많을 때 (DISCOVERY~IDEA_CARD)',
   '3C 가설, 경쟁 후보 3개, Evidence 2개',
   'Issue Tree, 핵심 가정/리스크, Next Questions',
   '핵심 가정이 Issue Tree에 반영되면 명확성 가점',
   'Gate1 패키지 필수(경쟁/구조 계열)',
   1, '<=2h (Quick-Run) / <=1d (Full)',
   'Evidence 2개(라벨 포함)',
   '["DISCOVERY","IDEA_CARD"]',
   '3C 분석과 이슈 트리를 구성합니다.

## 1단계: 3C 분석
- Company(자사): 핵심 역량과 약점
- Customer(고객): 니즈와 행동 패턴
- Competitor(경쟁사): 주요 경쟁자 3곳 분석

## 2단계: 이슈 트리 구성
핵심 질문을 MECE 원칙으로 분해합니다.

## 3단계: 가정/리스크 정리
이슈 트리의 각 가지에서 핵심 가정과 리스크를 도출합니다.',
   '{"issueTree":{"type":"object","root":"string","branches":"array"},"assumptions":{"type":"array","items":{"statement":"string","risk":"string"}},"nextQuestions":{"type":"array","items":"string"}}'),

  ('MP-03', 'STP(세그먼트-타깃-포지셔닝)', 'Tier-1', '시장',
   '시장 세분/타깃 우선순위가 필요할 때 (IDEA_CARD)',
   '시장 정의, 세그먼트 후보, Actor/채널, Evidence 3개',
   '세그먼트 목록, 타깃 우선순위, 포지셔닝 문장',
   '타깃 명확화 시 시장 적합 가점',
   'Gate1 또는 BIZ_PLANNING에서 유용',
   0, '<=1-2d',
   'Evidence 3개(시장/고객 데이터)',
   '["IDEA_CARD","HYPOTHESIS"]',
   NULL, NULL),

  ('MP-04', 'TAM/SAM/SOM(시장 규모)', 'Tier-1', '시장',
   '규모 추정이 필요하거나 투자/예산 논의가 시작될 때 (IDEA_CARD~SPRINT)',
   '시장 정의, 채택 가정, 단가/계약 형태, Evidence 3개',
   'TAM/SAM/SOM 표, 핵심 가정, 민감도 포인트',
   '수익성/규모 점수 보정',
   'BIZ_PLANNING 필수 후보',
   0, '<=1-2d',
   'Evidence 3개(출처/날짜 포함)',
   '["IDEA_CARD","HYPOTHESIS","SPRINT"]',
   NULL, NULL),

  ('MP-05', '포터 5요인', 'Tier-1', '경쟁',
   '산업 구조/진입장벽/대체재가 쟁점일 때 (IDEA_CARD)',
   '경쟁군 정의, 5요인 가설, Evidence 3개',
   '5F 요약, 위협/기회 요인',
   '방어가능성 점수 보정',
   'Gate1 보조(필요 시)',
   0, '<=1-2d',
   'Evidence 3개',
   '["IDEA_CARD","HYPOTHESIS"]',
   NULL, NULL),

  ('MP-06', '가치 흐름/체인', 'Tier-1', '생태계',
   '표준/플랫폼/프로토콜 신호에서 가치 이동을 파악할 때 (DISCOVERY~EXPERIMENT)',
   '돈/데이터/동의/책임 흐름 가설, Actor 5개, Evidence 3개',
   'Value Flow 다이어그램, 병목/규제 포인트',
   '차별화/포지셔닝 점수 보정',
   '표준 신호에서는 Gate1 권장',
   0, '<=1-2d',
   'Evidence 3개',
   '["DISCOVERY","IDEA_CARD","HYPOTHESIS","EXPERIMENT"]',
   NULL, NULL),

  ('MP-07', '의사결정자 맵(B2B)', 'Tier-1', '고객/구매',
   'B2B 의사결정 구조가 불명확할 때 (IDEA_CARD~EXPERIMENT)',
   '조직도 가설, 역할(사용자/결정자/보안/구매), Evidence 2개',
   'Buying Center 맵, 접근 전략',
   '실행가능성 점수 보정',
   'Gate2 전후 권장',
   0, '<=1d',
   'Evidence 2개 + 인터뷰 1개 권장',
   '["IDEA_CARD","HYPOTHESIS","EXPERIMENT"]',
   NULL, NULL),

  ('MP-08', '리스크/준법 점검', 'Tier-2', '리스크',
   '데이터/보안/규제/계약 리스크가 의사결정 변수일 때 (EXPERIMENT~SPRINT)',
   '데이터 범위, 처리 위치, 규제/정책, 보안 요구, Evidence 2개',
   'Risk Pass 결과(OK/Conditional/Block), 요구 조치',
   '리스크 항목은 Red-flag로 점수 감점',
   'Gate2/BIZ_PLANNING 필수',
   0, '<=1d',
   'Evidence 2개 + 내부 정책 링크',
   '["EXPERIMENT","EVIDENCE_REVIEW","SPRINT"]',
   NULL, NULL),

  ('MP-09', '구축-구매-파트너', 'Tier-2', '실행',
   '구현 옵션을 비교해야 할 때 (EXPERIMENT~SPRINT)',
   '옵션 3개, 역량/파트너 후보, 비용/리드타임 가정, Evidence 2개',
   '옵션 비교표, 권고안, 의존성',
   '실행가능성/속도 점수 보정',
   'BIZ_PLANNING 필수 후보',
   0, '<=1d',
   'Evidence 2개(벤더/내부역량)',
   '["EXPERIMENT","EVIDENCE_REVIEW","SPRINT"]',
   NULL, NULL),

  ('MP-10', '유닛 이코노믹스(라이트)', 'Tier-2', '비즈니스',
   '파일럿→확장 손익 구조를 봐야 할 때 (SPRINT)',
   '단가/원가/운영비 가정, 채택률, Evidence 2개',
   '간이 손익, break-even 가정, 민감도',
   '사업성 점수 보정',
   'BIZ_PLANNING 권장',
   0, '<=1-2d',
   'Evidence 2개',
   '["SPRINT","GATE2"]',
   NULL, NULL),

  ('MP-11', '시나리오 플래닝(3)', 'Tier-2', '예측',
   '시간 축(확산/충돌/병목)을 판단해야 할 때 (IDEA_CARD~SPRINT)',
   '주요 변수 3개, 불확실성 2개, Evidence 2개',
   '3 시나리오, 변수/가정, 대응 옵션',
   '시간 민감도/리스크 점수 보정',
   'Gate2/BIZ_PLANNING 권장',
   0, '<=1d',
   'Evidence 2개',
   '["IDEA_CARD","HYPOTHESIS","EXPERIMENT","SPRINT"]',
   NULL, NULL),

  ('MP-12', '초기 선행지표 KPI 세트', 'Tier-2', '예측/운영',
   '예측을 관측으로 바꾸고 운영 알림을 붙일 때 (EXPERIMENT~HANDOFF)',
   'KPI 후보 3개, 수집 경로, 오너, cadence, Evidence 1개 이상',
   'IndicatorSet(임계치/알림/다음 행동)',
   '예측 준비도 점수 보정',
   'Gate2 필수',
   0, '<=0.5-1d',
   'Evidence 1개 이상 + 관측 경로 계약',
   '["EXPERIMENT","EVIDENCE_REVIEW","SPRINT","GATE2","HANDOFF"]',
   NULL, NULL);
