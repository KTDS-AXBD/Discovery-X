# PRD Studio PRD

**버전:** v7 (pm-skills 통합, 최종 후보)
**날짜:** 2026-03-12
**작성자:** AX BD팀
**상태:** 🔄 검토 중

---

## 1. 요약

**한 줄 정의:**
Discovery-X 앱 내에서 pm-skills 프레임워크 기반 대화형 인터뷰 → PRD 자동 생성 → AI 다중 검토 → 피드백 반영 → 착수 판단까지 수행하는 웹 UI + CLI 하이브리드 기능.

**배경:**
CLI 전용 인터뷰 스킬의 접근성 한계 + Discovery-X 아이디어 분석에 체계적 PM 프레임워크 부재. [phuryn/pm-skills](https://github.com/phuryn/pm-skills) (MIT, 65스킬/8플러그인)를 커스터마이즈하여 CLI + 웹 양쪽에 적용한다.

**목표:**
- CLI: pm-skills 플러그인 설치 + Discovery-X 맥락 커스터마이즈
- 웹 UI: PRD Studio + 아이디어 분석에 pm-skills 프레임워크 내장
- 1차: 신규 영역(Strategy/Execution/GTM) 도입, 2차: 중복 스킬 대체

---

## 2. 문제 → 해결 → 측정 연결 (Traceability)

| # | 문제 (As-Is) | 해결 (To-Be) | 측정 (KPI) |
|---|-------------|-------------|------------|
| P1 | CLI 전용 → 비개발자 4명 접근 불가 | 웹 UI PRD Studio | 비개발자 PRD 작성 팀원당 1+/분기 |
| P2 | 아이디어 분석 12종 자체 프롬프트 → 프레임워크 불일관 | pm-skills 프레임워크로 점진적 대체 | 분석 품질 (섹션 완성도) |
| P3 | Strategy/GTM/OKR 도구 부재 | pm-skills 4개 플러그인 도입 | CLI 사용 주 3+회 |
| P4 | 검토 결과 로컬 파일 → 팀 공유 불가 | DB 저장 + 웹 뷰어 | 검토 완주율 90%+ |

---

## 3. pm-skills ↔ Discovery-X 매핑

### 3.1 신규 도입

| 플러그인 | 핵심 스킬 | 적용 |
|---------|-----------|------|
| pm-product-strategy (12) | product-strategy, value-proposition, pricing | CLI + 사업제안 연동 |
| pm-execution (15) | create-prd, okrs, sprint, retro, pre-mortem | CLI + PRD Studio 핵심 |
| pm-go-to-market (6) | gtm-strategy, beachhead, ICP, growth-loops | CLI + 사업제안 GTM |
| pm-market-research (7) | competitor-analysis, market-sizing, user-personas | CLI + 아이디어 분석 보강 |

### 3.2 중복 대체 (2차)

| 기존 분석 | pm-skills 대체 | 개선점 |
|-----------|---------------|--------|
| 시장 조사 | market-sizing + competitor-analysis | TAM/SAM/SOM + 경쟁사 분리 |
| 고객 조사 | user-personas + journey-map | 페르소나 + 여정 맵 |
| BMC/린캔버스 | business-model / lean-canvas | 가이드 상세화 |
| SWOT | swot-analysis | 단순 매트릭스→실행 권고 |
| PESTEL | pestle-analysis | 6관점 체계화 |

### 3.3 유지 (Discovery-X 고유)
비판적 사고, 사업성 평가, 차별화 분석, 규제/법적 환경, 산업별 사례 — 한국 시장/KT DS 내부 기준 특화

---

## 4. 사용자 여정

### 4.1 CLI (개발자)
```
pm-skills 플러그인 설치 → /strategy, /write-prd, /plan-okrs, /plan-launch
```

### 4.2 웹 PRD Studio (비개발자)
```
아이디어 상세/"새 PRD" → 온보딩(최초 3단계 스포트라이트)
→ 인터뷰 (8섹션, 예시 답변 접힘, 진행률 바, 중간 저장)
→ PRD v1 자동 생성 → 미리보기/편집
→ "AI 검토" (외부 전송 고지) → 모델별 진행 뱃지
→ 피드백 뷰어 (AI별 탭) + 스코어카드 (레이더 차트)
→ 수정 → 재검토 또는 착수 확정 (만족도 1문항)
```

### 4.3 비개발자 UX 설계
- **온보딩**: 최초 3단계 스포트라이트 (기존 패턴 재사용)
- **예시 답변**: 섹션별 접힘 ("예: '수동 엑셀 관리에 30분씩 걸려요'")
- **진행률**: 8섹션 프로그레스 바 + 현재 섹션명
- **중간 저장**: DB → 브라우저 닫아도 이어하기
- **도움말**: 화면 하단 FAQ 링크
- **접근성**: 키보드 내비게이션, @axis-ds WCAG AA

### 4.4 이탈 분석

| 이벤트 | 시점 | 기록 |
|--------|------|------|
| `interview_start` | 시작 | userId, prdId, source |
| `interview_section_complete` | 섹션 완료 | sectionNumber(1~8), elapsed |
| `interview_abandon` | 이탈 | lastSection, totalElapsed |
| `prd_generated` | 생성 | version, wordCount |
| `review_start/complete` | 검토 | models, round, score |
| `prd_finalized` | 착수 | finalScore, rating |

---

## 5. 기능 범위

### Phase 1: CLI 적용 (2일)
| # | 작업 |
|---|------|
| 1 | pm-skills 4개 플러그인 설치 + 커스터마이즈 |
| 2 | PRD 템플릿 통합 (8섹션 pm-skills 기준으로 통일) |

### Phase 2: 웹 PRD Studio (16일)
| # | 기능 |
|---|------|
| 1 | DB 스키마 + AI 병렬 호출 PoC (5일) |
| 2 | 인터뷰 UI + 온보딩 + 중간 저장 + PRD 생성 (5일) |
| 3 | 피드백 뷰어 + 스코어카드 + 편집기 + 버전 관리 (4일) |
| 4 | UAT(팀원 3명+) + 버그 수정 + 배포 (2일) |

### Phase 3: 아이디어 분석 대체 (4일)
6종 프롬프트를 pm-skills 프레임워크로 교체 + 테스트

### Phase 4: 전략 도구 (5일)
Strategy Canvas + GTM 웹 UI + 사업제안 연동

**합계: 27일 (~5.5주)**

### 제외
외부 공개 / 실시간 협업 / 모바일 전용 / pm-data-analytics / pm-marketing-growth

---

## 6. 성공 기준

### 6.1 KPI
| 지표 | 현재 | 목표 | 측정 | 연결 문제 |
|------|------|------|------|-----------|
| 비개발자 PRD 작성 | 0건 | 팀원당 1+/분기 | DB | P1 |
| PM 스킬 CLI 사용 | 0 | 주 3+회 | 로그 | P3 |
| 인터뷰 완주율 | - | 80%+ | abandon | P1 |
| 검토 완주율 | 50% | 90%+ | review_complete | P4 |
| 분석 품질 | 정성적 | 섹션 완성도 점수 | pm-skills 프레임워크 | P2 |
| 만족도 | - | 긍정 70%+ | 평점+코멘트 | P1 |

### 6.2 MVP (Phase 1+2)
- [ ] pm-skills CLI 4개 플러그인 동작
- [ ] 웹 인터뷰 8섹션 + 중간 저장 + 온보딩
- [ ] PRD 생성 + 편집 (pm-skills 8섹션 템플릿)
- [ ] AI 검토 + 스코어카드
- [ ] 이탈 이벤트 로깅

### 6.3 AI 검토 품질 PoC
Phase 2에서 동일 PRD를 CLI와 웹으로 검토 비교. verdict 일치 100%, 피드백 ±20%.

### 6.4 실패 + 개선 루프
| 조건 | 개선 | 중단 |
|------|------|------|
| 3개월 비개발자 미사용 | 1:1 인터뷰→UX 개선 | 개선 후 1개월 미사용 |
| API $30+/월 | mini 다운그레이드 | 다운그레이드 후 초과 |
| 완주율 50% 미만 | 이탈 분석→UX 개선 | 2회 개선 후 미달 |

---

## 7. 제약 조건

### 7.1 기술 스택
- CLI: pm-skills 플러그인 (MIT) / 웹: Remix+D1+Edge fetch / SKILL.md를 프롬프트 소스로 활용

### 7.2 기술 리스크 + 장애 대응
| 리스크 | 대응 | Fallback |
|--------|------|----------|
| AI 30초 타임아웃 | `Promise.allSettled` + 25초 | 부분 성공 허용 |
| AI API 장애 | 4단계 fallback (OpenAI→Gemini→DeepSeek→수동) | radar-worker 패턴 |
| SSE 끊김 | 폴링 30초 | status API |
| 비용 초과 | 월간 추적 + 80% 알림 | budget_policies |

### 7.3 테스트/QA
| 단계 | 내용 | 시점 |
|------|------|------|
| 단위 테스트 | 인터뷰 상태머신, PRD 생성, 스코어카드 | Phase 2 |
| PoC 품질 검증 | CLI vs 웹 동일 PRD 비교 | Phase 2 |
| UX 검증 | 비개발자 1명 인터뷰 플로우 | Phase 2 완료 시 |
| UAT | 팀원 3명+ 실제 PRD 작성 | Phase 2 마지막 |
| 프롬프트 품질 | pm-skills 프롬프트 교체 전후 분석 결과 비교 | Phase 3 |

### 7.4 배포/롤백
- Feature Flag `PRD_STUDIO_ENABLED` / 프리뷰 배포 후 UAT / 즉시 비활성화 가능

### 7.5 민감 정보
- 전송 전 확인 다이얼로그 / 작성 금지 지침 / API 키 서버사이드 전용 / 삭제 cascade

### 7.6 인력/예산
- 1명 — Escalation: BD팀 리더 / API: PRD당 ~$0.05, 월 $30 미만

---

## 8. 오픈 이슈

| # | 이슈 | 마감 |
|---|------|------|
| 1 | pm-skills 8섹션 PRD vs 기존 7섹션 템플릿 통합 방식 | Phase 1 |
| 2 | SKILL.md → 웹 API 프롬프트 변환 파이프라인 | Phase 2 |
| 3 | 아이디어 분석 교체 시 기존 결과 마이그레이션 | Phase 3 |
| 4 | DB 스키마 확정 (prds + prd_events) | Phase 2 |

---

## 9. 검토 이력

| 라운드 | 변경사항 | 스코어 |
|--------|---------|--------|
| v1~v5 | 인터뷰 기반 5회 AI 검토 | 92→82→82→62→64 |
| v6 | pm-skills 통합 재설계 | 82 |
| v7 | Traceability(§2), QA(§7.3), UX(§4.3), 온보딩(§4.2), 일정 현실화(27일) | - |

---

*이 문서는 requirements-interview 스킬에 의해 자동 생성 및 관리됩니다.*
