# Discovery-X Full Pipeline Test Scenarios

> 전체 파이프라인 점검용 테스트 시나리오
> 작성일: 2026-03-08
> 기준 버전: 0.5.0 | 테스트: 1,959 passing

## 개요

Discovery-X의 **전체 데이터 흐름**(Radar -> Ideas -> Discovery 11단계 -> Archive/Proposals)을
종단간(end-to-end) 관점에서 점검하는 시나리오 목록.

```
[Radar Sources] -> [Radar Items] -> [Ideas] -> [Discovery] -> 11-stage Pipeline
                                        |            |
                                        v            v
                                  [Proposals]   [Archive]
                                                (HOLD/DROP/HANDOFF)
```

---

## 1. Radar (Signal Collection)

### 1.1 소스 관리

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| R-01 | Radar 소스 생성 (RSS/Newsletter/Custom) | unit | O | `services/radar.test.ts` (있으면) |
| R-02 | 소스 활성화/비활성화 | unit | ? | - |
| R-03 | 소스 삭제 시 하위 items 처리 | integration | ? | - |
| R-04 | 키워드/태그 설정 | unit | ? | - |
| R-05 | 테넌트별 소스 격리 | unit | ? | - |

### 1.2 수집/요약

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| R-06 | Cron signal-route 트리거 (인증) | integration | O | `cron-routes-bearer.test.ts`, `cron-routes-query-param.test.ts` |
| R-07 | 수집된 아이템 status = COLLECTED | unit | ? | - |
| R-08 | AI 요약 (titleKo, summaryKo, keyPoints) | unit | ? | - |
| R-09 | 아이템 읽음/안읽음 상태 (radarItemUserStatus) | unit | ? | - |
| R-10 | 아이템 반응 (like/dislike) | unit | ? | - |
| R-11 | 중복 URL 방지 | unit | ? | - |

### 1.3 대시보드 표시

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| R-12 | SourceSidebar 소스별 아이템 그룹핑 | unit | O | `dashboard.test.ts` |
| R-13 | SummaryCard 필드 표시 (요약/키워드/원본링크) | unit | O | `dashboard.test.ts` |
| R-14 | 통계 4개 지표 (소스/발굴/파이프라인/제안) | unit | O | `dashboard.test.ts`, `metrics.test.ts` |
| R-15 | 파이프라인 섹션 (11단계 현황 카드) | unit | O | `dashboard.test.ts` |

---

## 2. Ideas (Idea Workspace)

### 2.1 아이디어 CRUD

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| I-01 | 아이디어 생성 (수동) | unit | O | `services/idea.test.ts` |
| I-02 | 아이디어 생성 (Agent/시스템) | unit | O | `services/idea.test.ts` |
| I-03 | 아이디어 삭제 (소스 연결 해제 포함) | unit | O | `components/ideas/delete-idea-logic.test.ts` |
| I-04 | 제목 인라인 편집 | unit | O | `components/ideas/editable-title-logic.test.ts` |
| I-05 | AI 제목 추천 | unit | O | `components/ideas/suggest-title-logic.test.ts` |
| I-06 | 아이디어 카드 그리드 (내/팀 분리) | unit | O | `components/ideas/idea-card-grid-logic.test.ts` |

### 2.2 소스 연결

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| I-07 | Radar 아이템 -> 아이디어 소스 연결 | unit | O | `services/idea.test.ts` |
| I-08 | 소스 Drag & Drop 추가/제거 | unit | O | `components/ideas/source-input-panel-logic.test.ts` |
| I-09 | 소스 타입별 필터 | unit | O | `components/ideas/source-filter-bar-logic.test.ts` |
| I-10 | 소스 브라우저 (타입 카운트 pill) | unit | O | `components/ideas/source-browser-logic.test.ts` |
| I-11 | 멀티소스 선택 + 분석 | unit | O | `services/idea.test.ts` |

### 2.3 분석 (SSE)

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| I-12 | SSE 분석 API (카테고리별 Claude 호출) | unit | O | `ideas/analysis-pipeline.test.ts` |
| I-13 | 분석 진행률 UI 상태 | unit | ? | - |
| I-14 | stale sourceIds 감지 (소스 변경 후 재분석) | unit | ? | - |
| I-15 | 방법론 카드 마크다운 렌더링 | unit | O | `components/ideas/methodology-collapse-logic.test.ts` |

### 2.4 아이디어 -> 사업제안

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| I-16 | 아이디어에서 사업 제안 생성 (12 카테고리 -> 10 섹션) | unit | O | `components/ideas/proposal-mapping-logic.test.ts` |
| I-17 | api.ideas.$id.create-proposal API | integration | ? | - |

---

## 3. AI Pipeline (Radar -> Ideas -> Discovery 자동)

### 3.1 파이프라인 실행

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| AP-01 | Cron ai-pipeline 인증 (secret 검증) | integration | O | `cron-routes-*.test.ts` |
| AP-02 | 미처리 Radar 아이템 조회 (COLLECTED/SCORED + aiProcessedAt null) | unit | - | **GAP** |
| AP-03 | 아이템 클러스터링 (LLM -> ClusterResult JSON) | unit | - | **GAP** |
| AP-04 | 아이디어 생성 (클러스터 -> IdeaResult) | unit | - | **GAP** |
| AP-05 | Discovery 평가 (confidence threshold 70) | unit | - | **GAP** |
| AP-06 | confidence >= 70: Discovery 생성 + HYPOTHESIS 전환 + Evidence 자동 생성 | unit | - | **GAP** |
| AP-07 | confidence < 70: Discovery 미생성, 아이디어만 생성 | unit | - | **GAP** |
| AP-08 | aiProcessedAt 마킹 (처리 완료 후) | unit | - | **GAP** |
| AP-09 | 타임아웃 처리 (23초 제한) | unit | - | **GAP** |
| AP-10 | MAX 제한 (아이템 3개, 아이디어 1개, Discovery 1개/run) | unit | - | **GAP** |
| AP-11 | pipeline_run 레코드 상태 (RUNNING -> COMPLETED/FAILED) | unit | - | **GAP** |
| AP-12 | 토큰 사용량 누적 (tokenUsage) | unit | - | **GAP** |
| AP-13 | 중복 Evidence sourceUrl 방지 | unit | - | **GAP** |
| AP-14 | confidence -> EvidenceStrength 매핑 (A/B/C/D) | unit | O | `ideas/evidence-pipeline.test.ts` |
| AP-15 | 빈 아이템 시 즉시 완료 | unit | - | **GAP** |
| AP-16 | 클러스터링 실패 시 markProcessed + 완료 | unit | - | **GAP** |

### 3.2 수동 전환

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| AP-17 | Ideas -> Discovery 수동 전환 (api.ideas.$id.create-discovery) | integration | O | `actions/create-discovery-from-idea.test.ts` |
| AP-18 | 가설/최소행동/기한/기대근거 필수 검증 | integration | O | `actions/create-discovery-from-idea.test.ts` |

---

## 4. Discovery Pipeline (11단계 상태 전환)

### 4.1 DISCOVERY (Inbox)

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| D-01 | Discovery 생성 (CRUD) | unit | O | `services/discovery.test.ts` |
| D-02 | DISCOVERY -> IDEA_CARD 전환 (Promote) | integration | O | `actions/promote.test.ts` |
| D-03 | DISCOVERY -> HOLD 전환 | integration | O | `actions/decide-not-now.test.ts` |
| D-04 | DISCOVERY -> DROP 전환 | integration | O | `actions/decide-dead-end.test.ts` |
| D-05 | 승격 시 Owner 필수 + 첫 실험 생성 + dueDate 계산 | integration | O | `actions/promote.test.ts` |

### 4.2 IDEA_CARD (Open)

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| D-06 | IDEA_CARD -> HYPOTHESIS | unit | O | `services/discovery.test.ts`, `validation/discovery-rules.test.ts` |
| D-07 | IDEA_CARD -> HOLD | integration | O | `actions/decide-not-now.test.ts` |
| D-08 | IDEA_CARD -> DROP | integration | O | `actions/decide-dead-end.test.ts` |
| D-09 | 연장 요청 (requestExtension) | integration | O | `actions/request-extension.test.ts` |

### 4.3 HYPOTHESIS

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| D-10 | HYPOTHESIS -> EXPERIMENT (실험 추가) | integration | O | `actions/add-experiment.test.ts` |
| D-11 | HYPOTHESIS -> HOLD | unit | O | `validation/discovery-rules.test.ts` |
| D-12 | HYPOTHESIS -> DROP | unit | O | `validation/discovery-rules.test.ts` |

### 4.4 EXPERIMENT

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| D-13 | 실험 생성 (최대 2개, Extension 시 3개) | integration | O | `actions/add-experiment.test.ts` |
| D-14 | 실험 완료 (complete-experiment) | integration | O | `actions/complete-experiment.test.ts` |
| D-15 | EXPERIMENT -> EVIDENCE_REVIEW | unit | O | `validation/discovery-rules.test.ts` |
| D-16 | EXPERIMENT -> HYPOTHESIS (회귀) | unit | O | `validation/discovery-rules.test.ts` |
| D-17 | EXPERIMENT -> HOLD / DROP | unit | O | `validation/discovery-rules.test.ts` |

### 4.5 EVIDENCE_REVIEW

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| D-18 | Evidence 추가 (type/strength/reliabilityLabel/sourceUrl) | integration | O | `actions/add-evidence.test.ts` |
| D-19 | EVIDENCE_REVIEW -> GATE1 (승인 요청) | integration | O | `actions/decide-next.test.ts` |
| D-20 | EVIDENCE_REVIEW -> HYPOTHESIS (회귀) | unit | O | `validation/discovery-rules.test.ts` |
| D-21 | EVIDENCE_REVIEW -> HOLD / DROP | unit | O | `validation/discovery-rules.test.ts` |

### 4.6 GATE1

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| D-22 | 승인 요청 (submitForApproval: PENDING) | integration | O | `actions/approve-decision.test.ts` |
| D-23 | Reviewer 승인 (approveDecision) -> GATE1 상태 전환 | integration | O | `actions/approve-decision.test.ts` |
| D-24 | Reviewer 반려 (rejectDecision) | integration | O | `actions/approve-decision.test.ts` |
| D-25 | GATE1 -> SPRINT | unit | O | `validation/discovery-rules.test.ts` |
| D-26 | GATE1 -> HOLD / DROP | unit | O | `validation/discovery-rules.test.ts` |

### 4.7 SPRINT

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| D-27 | SPRINT -> GATE2 | unit | O | `validation/discovery-rules.test.ts` |
| D-28 | SPRINT -> HOLD / DROP | unit | O | `validation/discovery-rules.test.ts` |
| D-29 | Gate 타임아웃 경고 (gate-timeout Cron) | integration | O | `agent/gate-timeout.test.ts` |

### 4.8 GATE2

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| D-30 | GATE2 -> HANDOFF (최종 승인) | unit | O | `validation/discovery-rules.test.ts` |
| D-31 | GATE2 -> SPRINT (회귀) | unit | O | `validation/discovery-rules.test.ts` |
| D-32 | GATE2 -> HOLD / DROP | unit | O | `validation/discovery-rules.test.ts` |

### 4.9 Terminal States

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| D-33 | HANDOFF -> (전환 불가, 빈 배열) | unit | O | `validation/discovery-rules.test.ts` |
| D-34 | DROP -> (전환 불가) + failurePattern 태깅 필수 | integration | O | `actions/decide-dead-end.test.ts` |
| D-35 | HOLD -> DISCOVERY/IDEA_CARD/HYPOTHESIS/EXPERIMENT/DROP 복귀 | unit | O | `validation/discovery-rules.test.ts` |
| D-36 | HOLD triggerType + revisitDate 필수 | integration | O | `actions/decide-not-now.test.ts` |
| D-37 | 허용되지 않은 전환 시 ValidationError throw | unit | O | `validation/discovery-rules.test.ts` |

---

## 5. Cross-Pipeline: 승인 워크플로우

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| CW-01 | Reviewer 미지정 시 승인 요청 불가 | integration | O | `actions/approve-decision.test.ts` |
| CW-02 | 이미 PENDING인 상태에서 중복 승인 요청 불가 | integration | O | `actions/approve-decision.test.ts` |
| CW-03 | 승인 시 pendingDecisionData 반영 (GATE1/HOLD/DROP) | integration | O | `actions/approve-decision.test.ts` |
| CW-04 | 반려 시 상태 복원 (REJECTED) | integration | O | `actions/approve-decision.test.ts` |
| CW-05 | Owner 변경 (활성 상태에서만) | unit | O | `services/discovery.test.ts` |
| CW-06 | Reviewer 변경 | unit | O | `services/discovery.test.ts` |
| CW-07 | Gatekeeper 변경 | unit | O | `services/discovery.test.ts` |

---

## 6. Proposals (Business Proposals)

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| P-01 | 사업제안 생성 (10개 섹션) | unit | O | `services/proposal.test.ts` |
| P-02 | 마일스톤 관리 (CRUD) | unit | O | `services/proposal.test.ts` |
| P-03 | 액션 아이템 관리 | unit | O | `services/proposal.test.ts` |
| P-04 | 댓글/좋아요 | unit | O | `services/proposal.test.ts`, `components/proposals/team-discussion-logic.test.ts` |
| P-05 | 카테고리 관리 | unit | O | `services/proposal.test.ts` |
| P-06 | 팀 멤버 관리 | unit | O | `services/proposal.test.ts` |

---

## 7. Agent / Chat

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| AG-01 | 대화 생성 (conversation + messages) | unit | O | `agent/session-manager.test.ts` |
| AG-02 | 시스템 프롬프트 빌드 (BD 특화) | unit | O | `agent/system-prompt-bd.test.ts` |
| AG-03 | 도구 레지스트리 (autonomy level 별) | unit | O | `agent/tool-registry-bd.test.ts` |
| AG-04 | Discovery 도구 (52개 테스트) | integration | O | `agent/discovery-tools.test.ts` |
| AG-05 | SSE 스트리밍 응답 (executor-stream) | unit | partial | `agent/executor-stream.test.ts` (1 fail) |
| AG-06 | SOUL 엔진 (커스텀 프롬프트) | unit | O | `agent/soul-engine.test.ts` (내 기록) |
| AG-07 | 인사이트 추출 + 저장 | unit | O | `agent/agent-insight-extraction.test.ts` |
| AG-08 | Evidence 자동 인용 | unit | O | `agent/agent-pipeline-evidence.test.ts` |
| AG-09 | Memory lifecycle (결정 중심 요약) | unit | O | 있으면 |
| AG-10 | 토큰 예산 초과 경고 | integration | O | `token-budget.test.ts` |

---

## 8. Lab (Ontology/Analysis)

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| L-01 | 그래프 노드/엣지 CRUD | unit | fail | `features/lab/lab-service.test.ts` (22 fail) |
| L-02 | 온톨로지 엔티티 추출 (LLM) | unit | O | `ontology/extractor.test.ts` |
| L-03 | 글로벌 엔티티 매칭 | unit | O | `ontology/matcher.test.ts` |
| L-04 | 관계 분석 | unit | O | `ontology/analyzer.test.ts` |
| L-05 | 시뮬레이션 | unit | O | `ontology/simulator.test.ts` |
| L-06 | 리뷰 파이프라인 | integration | O | `ontology/review-pipeline.test.ts` |
| L-07 | Cron lab (자동 추출 threshold) | unit | O | `cron/lab-cron-threshold.test.ts` |

---

## 9. Matrix (Framework Scoring)

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| M-01 | 셀 점수 입력/조회 | unit | O | `services/scoring.test.ts` |
| M-02 | 히트맵 데이터 | unit | O | `services/matrix.test.ts` |
| M-03 | 합의(consensus) 집계 | unit | O | `services/matrix.test.ts` |
| M-04 | 배치 스코어링 | unit | O | `services/scoring-batch.test.ts` |
| M-05 | Cron matrix-scoring | integration | O | `cron-routes-*.test.ts` |

---

## 10. Auth / ACL / Security

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| S-01 | getUserFromSession (null 가능) | unit | O | `lib/auth/` |
| S-02 | requireUser (미인증 -> /login) | unit | O | `lib/auth/` |
| S-03 | requireGatekeeper (GATEKEEPER/ADMIN만) | unit | O | `lib/auth/` |
| S-04 | requireAdmin (ADMIN만) | unit | O | `lib/auth/` |
| S-05 | PENDING 사용자 -> /pending 리다이렉트 | unit | O | `lib/auth/` |
| S-06 | ACL 정책 (scope-based) | unit | O | `lib/acl/` |
| S-07 | 알림 웹훅 | unit | partial | `lib/notifications/webhook.test.ts` (1 fail) |

---

## 11. Recall & Monitoring

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| RC-01 | Recall 이벤트 추적 (5종) | unit | O | `services/recall-tracking.test.ts` |
| RC-02 | Weekly Review (활성 Discovery 경과일 순) | integration | O | `queries/review.test.ts` |
| RC-03 | Recall Queue (HOLD revisitDate 도래) | integration | O | `queries/recall.test.ts` |
| RC-04 | Weekly Summary Cron | integration | O | `cron/weekly-summary.test.ts` |
| RC-05 | 토큰 사용량 모니터링 (관리자) | unit | ? | - |

---

## 12. Requirements (Feature Requests)

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| RQ-01 | 요구사항 등록 + AI 자동 검토 | unit | O | `features/requests/workflow-service.test.ts` |
| RQ-02 | 엔티티 추출/매칭 | unit | O | `features/requests/entity-service.test.ts` |
| RQ-03 | 작업 계획 자동화 | unit | O | `features/requests/work-plan.test.ts` |
| RQ-04 | 8칸반 상태 전환 (접수->AI검토->담당자검토->반영 | 계획->진행중->완료 | 보류) | unit | O | `features/requests/workflow-service.test.ts` |

---

## 13. Topics (Team Collaboration)

| # | 시나리오 | 유형 | 커버 여부 | 테스트 파일 |
|---|----------|------|-----------|------------|
| T-01 | 토픽 CRUD | unit | O | `services/topic.test.ts` |
| T-02 | 시그널 서비스 | unit | O | `services/signal.test.ts` |
| T-03 | 멤버 관리 / 용어집 / 결정 기록 | unit | O | `services/topic.test.ts` |

---

## 14. End-to-End (E2E) 시나리오

> Playwright 기반. 현재 미커버 영역 중심으로 우선순위 배정.

### 14.1 Happy Path: 전체 파이프라인 관통

| # | 시나리오 | 우선순위 |
|---|----------|----------|
| E2E-01 | 로그인 -> 대시보드 -> Radar 아이템 확인 -> 아이디어 생성 -> 분석 실행 -> 사업제안 생성 | P0 |
| E2E-02 | 아이디어 -> Discovery 수동 전환 -> Promote -> Experiment -> Evidence -> GATE1 승인 -> SPRINT -> GATE2 -> HANDOFF | P0 |
| E2E-03 | Discovery -> HOLD (triggerType + revisitDate) -> Recall Queue 노출 -> 복귀 | P1 |
| E2E-04 | Discovery -> DROP (failurePattern 필수) -> Monthly Failure Replay 노출 | P1 |
| E2E-05 | Agent 채팅 -> 도구 호출 (Discovery 조회) -> 인용 표시 | P1 |

### 14.2 Edge Cases

| # | 시나리오 | 우선순위 |
|---|----------|----------|
| E2E-06 | 4주 time-box 초과 경고 | P2 |
| E2E-07 | 실험 2개 제한 -> Extension 요청 -> 승인 -> 3개 | P2 |
| E2E-08 | 동시 편집 충돌 (Discovery 상태 전환) | P2 |
| E2E-09 | PENDING 승인 중 Owner 변경 시도 | P2 |
| E2E-10 | 비인증 사용자 API 접근 (401/403) | P1 |

---

## GAP 분석 요약

### Critical GAPs (테스트 미커버)

| 영역 | 시나리오 ID | 설명 | 예상 테스트 수 |
|------|------------|------|---------------|
| **AI Pipeline** | AP-02 ~ AP-16 | AIPipelineService 전체 (15개 시나리오) | ~20 |
| **Radar Service** | R-01 ~ R-05, R-07 ~ R-11 | RadarService 단위 테스트 | ~12 |
| **Lab Service** | L-01 | lab-service.test.ts 22개 실패 (스키마 이슈) | fix 필요 |
| **Executor Stream** | AG-05 | 1개 실패 (SoulEngine mock 이슈) | fix 필요 |
| **Webhook** | S-07 | 1개 실패 | fix 필요 |

### 우선순위별 작업량

| 우선순위 | 내용 | 예상 테스트 수 |
|----------|------|---------------|
| **P0** | 기존 실패 3파일 수정 (lab 22 + executor 1 + webhook 1) | 24 fix |
| **P1** | AI Pipeline Service 테스트 신규 작성 | ~20 new |
| **P1** | Radar Service 단위 테스트 신규 작성 | ~12 new |
| **P2** | E2E 시나리오 작성 | ~10 new |

---

## 실행 계획

### Phase 1: 기존 실패 수정 (P0)
1. `tests/unit/features/lab/lab-service.test.ts` — ontologyTypes 스키마 컬럼 정합성 수정
2. `tests/unit/agent/executor-stream.test.ts` — SoulEngine mock 수정
3. `tests/unit/lib/notifications/webhook.test.ts` — 실패 원인 확인 및 수정

### Phase 2: AI Pipeline 커버리지 (P1)
1. `tests/unit/ai-pipeline/service.test.ts` 신규 — AIPipelineService 전체 메서드
2. Mock: callLLM, IdeaService, DiscoveryEntityService, DiscoveryWorkflowService
3. 시나리오: AP-02 ~ AP-16 (15개)

### Phase 3: Radar Service 커버리지 (P1)
1. `tests/unit/features/radar/radar-service.test.ts` 신규
2. 시나리오: R-01 ~ R-11 (11개)

### Phase 4: E2E (P2)
1. `tests/e2e/full-pipeline.spec.ts` — Happy Path
2. `tests/e2e/edge-cases.spec.ts` — Edge Cases
