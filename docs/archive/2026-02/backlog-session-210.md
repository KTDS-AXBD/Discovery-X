# Discovery-X 기능 백로그 (세션 210)

> 작성일: 2026-02-19
> 기준: SPEC.md §5 v6.15 + P4 Round 2, 테스트 925개, 프로덕션 운영 중

---

## 1. PRD v3 미구현 갭

PRD v3 (Architecture Upgrade) Phase 0~4 + Phase 5A~D 완료 상태 기준, 잔여 갭 분석.

| # | 항목 | PRD 섹션 | 우선순위 | 예상 규모 |
|---|------|---------|---------|---------|
| 1.1 | agent-worker DO 독립 배포 — 현재 메인 앱 라우트에서 DO 위임 스텁으로 동작. 별도 Worker로 Cloudflare 배포 미완 | §7 Durable Agent Runtime | P2 | L (2~3일) |
| 1.2 | collab-worker 독립 배포 — 현재 메인 앱 Cron 라우트로 기능 대체. 별도 Worker 배포 미완 | §9.3 Cron Trigger | P3 | L (2~3일) |
| 1.3 | Agent → Pipeline 쓰기 인터페이스 (`submitIdea`, `annotateSignal`) — PipelineBridge 읽기는 완료, 쓰기 경로 미구현 | §9.1 AgentToPipeline | P2 | M (1~2일) |
| 1.4 | Memory Lifecycle LLM 요약 병합 — `compact()` step 3 summarizer 콜백은 인터페이스만 존재, 실제 LLM 호출 미구현 | §8.2 3단계 수명 모델 | P2 | S (0.5일) |
| 1.5 | Projection 일괄 동기화 Cron — `api.cron.projection-sync.ts` 존재하나 전체 Graph 대상 배치 동기화 검증 필요 | §4.5 Projection 파이프라인 | P3 | S (0.5일) |
| 1.6 | Graph enrichment 제안 → 사용자 승인 UI — `graph_events` suggest 기록은 구현, 승인/반려 UI 미구현 | §6.4 Agent Graph 수정 제한 | P2 | M (1~2일) |
| 1.7 | Vectorize 시맨틱 검색 UI 노출 — 백엔드 Vectorize 연동 완료, 검색 UI에서 시맨틱 결과 활용 미표시 | §10.2 활용 시나리오 | P2 | M (1일) |
| 1.8 | 부하 테스트 — PRD §14 P4 항목, 미수행 | §14 Phase 4 | P3 | M (1~2일) |

---

## 2. v1.4 기획서 미충족 항목

v1.4 기획서 (운영 실험용 시스템)의 핵심 기능 대비 현 구현 갭.

| # | 항목 | 기획서 섹션 | 우선순위 | 예상 규모 |
|---|------|-----------|---------|---------|
| 2.1 | Monthly Failure Replay 뷰 — Dead End 큐레이션 + Not Now 재결정 전용 화면 미구현 (Weekly Review 뷰만 존재) | §7.6 운영 리듬 | P1 | M (1~2일) |
| 2.2 | Inbox(임시) → 승격 분리 UI — 현재 DISCOVERY 상태가 Seed+Inbox 역할을 겸함. "실험 등록 전까지 임시" 상태 시각화 부족 | §6 Seed Inbox | P2 | M (1일) |
| 2.3 | Inbox TTL 자동 리마인드 — 7일 미처리 Seed에 대한 자동 알림/만료 처리 미구현 | §6 Seed Inbox | P2 | M (1일) |
| 2.4 | 비판적 검증 4종 시스템 강제 — Evidence Check/Time Stress Test/Cross-Context Test/Ontology Consistency가 Agent 프롬프트에만 포함. Gate 통과 시 시스템 수준 검증 미적용 | §7.3 비판적 검증 | P2 | L (2~3일) |
| 2.5 | 재호출 이벤트 추적 — Not Now 재검토 수행 건수/Failure Pattern 재사용(링크) 건수 이벤트 로깅 미구현 | §10.2 최소 운영 지표 | P1 | S (0.5일) |
| 2.6 | 운영 지표 대시보드 — Seed→Experiment 전환율, Decision 종료율(리드타임), Dead End 종료 비율 등 §10 성공 기준 지표를 한 화면에 보여주는 대시보드 미구현 (/metrics 페이지 존재하지만 v1.4 기준 지표 미반영) | §10 성공 기준 | P1 | L (2~3일) |
| 2.7 | 온보딩 치트시트 — Evidence 타입/강도, Not Now 트리거, Failure Pattern 예시 압축 가이드 미구현 | §7.7 온보딩/코칭 | P2 | S (0.5일) |
| 2.8 | Discovery Owner 인수인계 기록 — Owner 변경 시 "무엇까지 했고, 다음 결정은 무엇인지" 1줄 필수 입력 미강제 | §6.1 Owner 변경 | P2 | S (0.5일) |

---

## 3. 품질 개선 백로그

코드베이스 탐색 결과 (TODO/FIXME, 테스트 커버리지 갭, 기술 부채).

| # | 항목 | 위치 | 우선순위 | 예상 규모 |
|---|------|------|---------|---------|
| 3.1 | 서비스 레이어 단위 테스트 부족 — `discovery.service.ts`, `idea.service.ts`, `radar.service.ts`, `proposal.service.ts`, `venture.service.ts`, `signal.service.ts`, `matrix-graph.service.ts` (7개 서비스 테스트 0건) | `app/lib/services/` | P2 | L (3~5일) |
| 3.2 | Cron 엔드포인트 통합 테스트 — 19개 Cron 중 `vectorize-sync`만 테스트 있음. 나머지 18개 Cron 인증/FF/핸들링 테스트 없음 | `app/routes/api.cron*.ts` | P3 | L (3~5일) |
| 3.3 | TODO: 프리셋 기능 미구현 — Venture 스프린트 생성 시 프리셋 선택 기능 TODO로 남아있음 | `app/routes/venture.sprints.new.tsx:48` | P3 | S (0.5일) |
| 3.4 | E2E 테스트 실행 환경 미검증 — `tests/e2e/` 6개 spec 파일 존재하지만 CI/CD에서 실행 여부 및 통과 여부 미확인 | `tests/e2e/` | P2 | M (1일) |
| 3.5 | Worker 디렉토리 정리 — `agent-worker/`, `collab-worker/` 코드가 메인 앱과 중복 기능. 독립 배포 or 정리 결정 필요 | `agent-worker/`, `collab-worker/` | P3 | M (1일) |
| 3.6 | API 라우트 통합 테스트 — 37+ API 라우트 중 일부만 통합 테스트 커버. 특히 proposals/lab/knowledge API 테스트 부족 | `app/routes/api.*` | P3 | L (3~5일) |
| 3.7 | health/monitoring 미커밋 파일 — `app/routes/admin.monitoring.tsx`, `app/routes/api.health.ts`, 관련 테스트가 untracked 상태 | git status 미추적 | P1 | S (즉시) |

---

## 4. 차기 개발 추천 (우선순위순)

| 순위 | 항목 | 근거 | 예상 기간 |
|------|------|------|----------|
| 1 | **미커밋 파일 정리 + 커밋** (3.7) | health/monitoring 코드가 untracked 상태. 프로덕션 운영 기본 인프라 | 즉시 |
| 2 | **v1.4 운영 지표 대시보드** (2.6) | 30~60일 운영 실험 성공 기준(§10) 측정이 불가능한 상태. Decision 종료율/전환율/완료율 시각화 필수 | 2~3일 |
| 3 | **Monthly Failure Replay 뷰** (2.1) | 운영 리듬 2개 미팅 중 1개(Monthly)의 지원 도구 부재. Dead End 자산화의 핵심 경로 | 1~2일 |
| 4 | **재호출 이벤트 추적** (2.5) | 운영 실험 성공 지표 "재호출 이벤트 월 1회 이상"을 측정할 이벤트 로깅 없음 | 0.5일 |
| 5 | **서비스 레이어 단위 테스트** (3.1) | 핵심 비즈니스 로직 7개 서비스 테스트 0건. 리팩토링/기능 추가 시 안전망 부재 | 3~5일 |
| 6 | **Graph enrichment 승인 UI** (1.6) | Agent가 제안한 Graph 변경을 사용자가 승인/반려할 수 있는 인터페이스 부재 | 1~2일 |
| 7 | **비판적 검증 4종 Gate 강제** (2.4) | v1.4 핵심 설계 원칙 "객관적 잣대 4종"이 Agent 프롬프트에만 존재, Gate 통과 시 시스템 검증 없음 | 2~3일 |
| 8 | **E2E 테스트 환경 정비** (3.4) | Playwright 스펙 6개 존재하지만 CI/CD 연동 및 실행 환경 미검증 | 1일 |
| 9 | **Agent → Pipeline 쓰기** (1.3) | Agent 대화 중 아이디어 제출/시그널 주석 기능이 실제로 파이프라인에 반영되지 않음 | 1~2일 |
| 10 | **Inbox TTL + 리마인드** (2.3) | Seed 방치 방지를 위한 자동 알림/만료 — 운영 실험 초기 습관 형성에 기여 | 1일 |

---

## 부록: 분석 요약

### PRD v3 전체 구현율
- Phase 0~4 + 5A~D: **~95% 완료** (의도적 차이 4건 제외)
- 잔여 갭: 8건 (주로 독립 Worker 배포, Agent 쓰기 인터페이스, UI 노출)

### v1.4 기획서 대비
- §9 v1 범위 필수 항목: **~85% 충족**
- 주요 미충족: 운영 지표 대시보드, Monthly Failure Replay, 재호출 이벤트 추적

### 코드 품질
- TODO/FIXME: **1건** (매우 깨끗)
- 서비스 테스트 커버리지: 11개 중 **4개만** 테스트 보유 (36%)
- Cron 테스트 커버리지: 19개 중 **1개만** 테스트 보유 (5%)
- Lint/TypeCheck/Build: 모두 통과 (0 에러)
- 테스트 통과율: 925/925 (100%)
