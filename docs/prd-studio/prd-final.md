# PRD Studio PRD

**버전:** v10 (최종)
**날짜:** 2026-03-12
**작성자:** AX BD팀
**상태:** ✅ 착수 준비 완료

---

## 1. 요약

**한 줄 정의:**
Discovery-X 앱 내에서 pm-skills 프레임워크 기반 대화형 인터뷰 → PRD 자동 생성 → AI 다중 검토 → 피드백 반영 → 착수 판단까지 수행하는 웹 UI + CLI 하이브리드 기능.

**배경:** CLI 전용 인터뷰 스킬의 접근성 한계 + 아이디어 분석에 체계적 PM 프레임워크 부재. [phuryn/pm-skills](https://github.com/phuryn/pm-skills) (MIT)를 커스터마이즈하여 CLI + 웹 양쪽에 적용.

**목표:** CLI pm-skills 도입 + 웹 PRD Studio + 아이디어 분석 대체 + 전략 도구 추가.

---

## 2. 문제 → 해결 → 측정 (Traceability)

| # | 문제 | 해결 | KPI | 측정 방법 | 분석 주기 | 책임 |
|---|------|------|-----|-----------|-----------|------|
| P1 | CLI 전용 → 비개발자 접근 불가 | 웹 PRD Studio | 비개발자 PRD 팀원당 1+/분기 | DB `prds.createdBy` + `users.role` JOIN | 월간 | Sinclair |
| P2 | 분석 프레임워크 불일관 | pm-skills 대체 | 분석 섹션 완성도 | pm-skills 템플릿 섹션 수 vs 실제 채워진 섹션 수 비율 | 분기 | Sinclair |
| P3 | Strategy/GTM/OKR 부재 | pm-skills 4개 플러그인 | CLI 사용 주 3+회 | Claude Code 세션 로그 커맨드 카운트 | 월간 | Sinclair |
| P4 | 검토 결과 공유 불가 | DB + 웹 뷰어 | 검토 완주율 90%+ | `prd_events.type='review_complete'` / `review_start` | 월간 | Sinclair |
| P5 | 사용자 만족도 미측정 | 착수 시 평가 | 긍정 70%+ | `prd_events.type='prd_finalized'` rating 필드 | 분기 | BD팀 |

---

## 3. pm-skills 통합 아키텍처

### 3.1 SKILL.md → 웹 프롬프트 변환

```
빌드 시: SKILL.md → 파싱 → pm-prompts/{name}.json
런타임: JSON 로드 → systemPrompt + outputTemplate → AI API 호출
```

JSON 구조: `{ name, systemPrompt, inputFields[], outputTemplate, category }`

**기존 코드 영향**: `analyzer.ts`의 카테고리별 프롬프트 문자열을 JSON import로 교체. UI 변경 없음.

### 3.2 매핑

**신규:** pm-product-strategy(12), pm-execution(15), pm-go-to-market(6), pm-market-research(7)
**대체(2차):** 시장조사/고객조사/BMC/SWOT/린캔버스/PESTEL → pm-skills 버전
**유지:** 비판적사고, 사업성평가, 차별화, 규제, 산업별사례 (한국 시장 특화)

---

## 4. 사용자 여정 + UX

### 4.1 웹 PRD Studio
```
아이디어/"새 PRD" → 온보딩(최초 3단계) → 인터뷰(8섹션, 예시, 진행률, 중간 저장)
→ PRD v1 → 편집 → "AI 검토"(전송 고지) → 피드백+스코어카드 → 수정/재검토/착수(만족도)
```

### 4.2 비개발자 UX
온보딩(3단계 스포트라이트) / 예시 답변(접힘) / 8섹션 프로그레스 바 / 중간 저장(DB) / FAQ / @axis-ds WCAG AA

### 4.3 이탈 분석
`interview_start` → `section_complete(1~8)` → `abandon/prd_generated` → `review_start/complete` → `prd_finalized`

### 4.4 에러 처리 UX

| 에러 상황 | 사용자 경험 |
|-----------|------------|
| AI 1개 모델 타임아웃 | "1개 모델 검토 완료. 나머지는 시간이 걸리고 있어요" + 부분 결과 즉시 표시 |
| AI 전체 실패 | "AI 서비스에 일시적 문제가 있어요. 잠시 후 다시 시도해주세요" + 재시도 버튼 |
| 중간 저장 실패 | 로컬스토리지 임시 저장 + "저장 중 문제 발생. 로컬에 임시 저장됨" |
| 세션 만료 | "세션이 만료됐어요. 로그인 후 이어서 작성할 수 있어요" + 인터뷰 진행 상태 보존 |
| 비용 한도 도달 | "이번 달 AI 검토 사용량이 한도에 가까워요. 관리자에게 문의하세요" |

---

## 5. 기능 범위 + 독립 배포 단위

### Phase 0: 사전 검증 (착수 전) — 1일
| # | 작업 |
|---|------|
| 1 | 비개발자 팀원 2명+ 대상 니즈 인터뷰 (현재 기획 프로세스 Pain Point 확인) |
| 2 | CLI에서 pm-skills `/write-prd` 3건 샘플 실행 → AI 산출물 품질 사전 확인 |

> Phase 0 결과가 기대에 미달 시 범위 축소 또는 보류 결정.

### Phase 1: CLI 적용 (독립 ✅) — 2일
pm-skills 4개 플러그인 설치 + PRD 템플릿 8섹션 통일

### Phase 2: 웹 PRD Studio (독립 ✅) — 16일
| 단계 | 범위 | 기간 | 실적 근거 |
|------|------|------|-----------|
| 2-1 | DB 스키마 + AI 병렬 PoC | 3일 | F40 cost 12테이블 = 2세션 |
| 2-2 | 인터뷰 UI + 온보딩 + 중간 저장 | 5일 | F29 요구사항 카드뷰+DnD = 4세션 |
| 2-3 | 검토 API + 피드백 뷰어 + 스코어카드 | 4일 | F35 슬라이드 Agent = 6세션 |
| 2-4 | 편집기 + 버전 관리 + 목록 | 2일 | 기존 마크다운+CRUD 패턴 |
| 2-5 | UX 검증(비개발자 1명) + UAT(3명+) + 버그 수정 | 2일 | |

### Phase 3: 분석 대체 (독립 ✅) — 4일
pm-prompts/ JSON 파이프라인 + analyzer.ts 6종 교체 + 전후 비교

### Phase 4: 전략 도구 (독립 ✅) — 5일
Strategy Canvas + GTM 웹 UI + 사업제안 연동

**합계: 27일 (~5.5주)** — 각 Phase 독립 배포 가능. Phase 2까지 = MVP.

### 일정 리스크 대응
| 우려 | 대응 |
|------|------|
| 전체 27일 과다 | Phase 1(2일) + Phase 2(16일) = MVP 18일. Phase 3/4는 다음 마일스톤 이월 가능 |
| 예상외 기술 이슈 | Phase 2-1 PoC로 사전 검증. 기존 SSE 패턴 100% 재사용 |
| 일정 초과 | 기능 축소 없이 시기만 조정 (Feature Flag로 완성된 부분만 배포) |

### 제외
외부 공개 / 실시간 협업 / 모바일 / pm-data-analytics / pm-marketing-growth

---

## 6. 성공 기준

### 6.1 KPI — §2 Traceability 참조 (측정 방법, 주기, 책임 포함)

### 6.2 MVP (Phase 1+2)
- [ ] CLI pm-skills 4개 플러그인 동작
- [ ] 웹 인터뷰 8섹션 + 중간 저장 + 온보딩
- [ ] PRD 생성 + 편집 (pm-skills 8섹션)
- [ ] AI 검토 + 스코어카드 + 이탈 로깅
- [ ] 에러 처리 UX 5종 (§4.4)

### 6.3 AI 검토 품질 PoC
Phase 2-1에서 CLI vs 웹 동일 PRD 비교. verdict 80%+ 일치, 피드백 항목 수 ±30% 이내.

### 6.4 실패 + 개선 루프
| 조건 | 개선 | 중단 |
|------|------|------|
| 3개월 비개발자 미사용 | 1:1 인터뷰→UX 개선 | 개선 후 1개월 미사용 |
| API $30+/월 | mini 다운그레이드 | 다운그레이드 후 초과 |
| 완주율 50% 미만 | 이탈 파트 분석→해당 UX 개선 | 2회 개선 후 미달 |

---

## 7. 제약

### 7.1 기술 리스크
| 리스크 | 대응 | Fallback |
|--------|------|----------|
| AI 30초 타임아웃 | `Promise.allSettled` + 25초 | 부분 성공 허용 |
| AI API 장애 | 4단계 fallback (OpenAI→Gemini→DeepSeek→수동) | radar-worker 패턴 |
| SSE 끊김 | 폴링 30초 | status API |
| 비용 초과 | 80% 알림 | budget_policies |

### 7.2 테스트/QA
| 단계 | 내용 | 시점 |
|------|------|------|
| 단위 | 인터뷰 상태머신, PRD 생성, 스코어카드, 에러 처리 | Phase 2 |
| PoC | CLI vs 웹 동일 PRD 비교 | Phase 2-1 |
| UX 검증 | 비개발자 1명 플로우 테스트 | Phase 2-5 |
| UAT | 팀원 3명+ 실제 PRD 1건씩 | Phase 2-5 |
| 프롬프트 | pm-skills 교체 전후 비교 | Phase 3 |

### 7.3 인증/권한
- 기존 `requireUser()` 가드 적용 (로그인 필수)
- PRD 작성/편집: 본인 PRD만 (createdBy 기준)
- PRD 읽기: 팀원 전체 (같은 테넌트)
- 검토 실행: PRD 작성자 + admin

### 7.4 데이터 백업/복구
- D1 자동 백업: Cloudflare D1 자체 Point-in-Time Recovery (30일 보관)
- PRD 버전 관리: 모든 편집이 새 버전으로 저장 (덮어쓰기 없음)
- 검토 결과: JSON 컬럼에 원본 보존, 삭제 시 cascade

### 7.5 배포: Feature Flag `PRD_STUDIO_ENABLED` / 프리뷰 배포 후 UAT / 즉시 비활성화
### 7.6 보안: 전송 고지 / 작성 지침 / 서버사이드 API 키 / cascade 삭제
### 7.7 인력: 1명 — Escalation: BD팀 리더 + 주간 코드 리뷰 (셀프 리뷰 체크리스트) / API: 월 $30 미만

---

## 8. 오픈 이슈

| # | 이슈 | 마감 |
|---|------|------|
| 1 | pm-skills 8섹션 vs 기존 7섹션 통합 방식 | Phase 1 |
| 2 | DB 스키마 확정 (prds + prd_events) | Phase 2-1 |
| 3 | 기존 분석 결과 마이그레이션 필요 여부 | Phase 3 |

---

## 9. 검토 이력

| 라운드 | 변경사항 | 스코어 |
|--------|---------|--------|
| v1~v5 | 기본 PRD Studio 5회 AI 검토 | 92→82→82→62→64 |
| v6 | pm-skills 통합 재설계 | 82 |
| v7 | Traceability, QA, UX, 온보딩 | 62 |
| v8 | 일정 리스크 해소 (실적 근거, 독립 배포, 축소 전략) | 82 |
| v9 | Conditional 해소: KPI 측정 구체화(§2), 에러 처리 UX(§4.4), 인증/권한(§7.3) | 82 |
| v10 | PoC 목표 현실화(verdict 80%+), Phase 0 사전 검증 추가, 데이터 백업(§7.4), 코드 리뷰 체계(§7.7) | - |
