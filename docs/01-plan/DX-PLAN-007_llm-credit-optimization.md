# LLM API Credit 소진 대응 — 구독 토큰 기반 분석 + 사용량 모니터링

> **Summary**: LLM API Credit 직접 소비 대신 Claude Code 구독 토큰 활용 방안 탐구 + Credit/토큰 사용량 모니터링
>
> **Project**: Discovery-X
> **Version**: 0.6.0
> **Author**: Sinclair Seo
> **Date**: 2026-03-10
> **Status**: Draft
> **Req**: DX-REQ-011 (F40, P1)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | AI 분석(Radar→Ideas 파이프라인, Agent 채팅)이 Anthropic/OpenAI API Credit을 직접 소비하여 크레딧 소진 시 서비스 중단. 현재 OpenAI fallback으로 동작 중이나 근본 해결 아님 |
| **Solution** | (1) `claude -p` headless 모드로 구독 토큰 기반 배치 분석 + (2) Anthropic Admin API로 Credit/비용 실시간 모니터링 |
| **Function/UX Effect** | API Credit 소비 없는 배치 분석 경로 확보 + 관리자 대시보드에서 비용 가시성 확보 |
| **Core Value** | 운영 비용 예측 가능성 + 서비스 연속성 보장 |

---

## 1. Overview

### 1.1 Purpose

Discovery-X의 AI 분석 기능이 LLM API Credit을 직접 소비하는 구조에서 탈피하여, 구독 기반 토큰 소비 모델로 전환하는 방안을 탐구한다. 동시에 Credit/토큰 사용량을 투명하게 모니터링하는 체계를 구축한다.

### 1.2 Background

**현재 상황**:
- Anthropic API Credit 소진 → OpenAI fallback으로 동작 중 (S344에서 Fallback 버그 수정)
- FallbackManager가 4개 프로바이더 체인(Anthropic→OpenAI→Google→Workers AI)을 관리하지만, 모두 API Key = Credit 소비
- `token_usage_logs` 테이블에 사용량을 기록하지만, 실제 API Credit 잔액은 모니터링 불가
- `TokenBudgetManager`는 앱 내부 예산(월 2M 토큰)만 관리 — 외부 Credit과 동기화 없음

### 1.3 Related Documents

- [[DX-REQ-011]] F40: LLM API Credit 소진 대응
- `app/lib/ai/fallback-manager.ts` — 현재 Fallback 체인
- `app/lib/cost/token-budget.ts` — 현재 토큰 예산 관리
- `app/db/token-usage-schema.ts` — 토큰 사용 로그 스키마

---

## 2. Scope

### 2.1 In Scope

- [x] **R1**: Claude Code 구독 토큰을 외부에서 활용하는 방법 조사 → **완료 (§3.1)**
- [ ] **R2**: 배치 DB 수집 → Trigger → Claude Code 원격 실행 아키텍처 설계
- [x] **R3**: API Credit 잔액/비용 조회 API 조사 → **완료 (§3.3)**
- [ ] **R4**: 사용자별 Credit 소비량 집계 및 대시보드 UI
- [ ] **R5**: 월간/일간 비용 예측 및 알림 체계

### 2.2 Out of Scope

- API Credit 자동 충전/결제 연동
- 멀티 테넌트 과금 체계 (테넌트별 별도 API Key 관리)
- LLM 모델 자체 파인튜닝 또는 로컬 모델 운영

---

## 3. 탐구 결과

### 3.1 탐구 영역 A: 구독 토큰 활용 가능성

#### A1. 구독 계정 토큰으로 API 호출이 가능한가?

**결론: 직접 API 호출 불가 / `claude -p` 경유만 허용**

| 방법 | 가능 여부 | 근거 |
|------|:---------:|------|
| OAuth Token(`sk-ant-oat01-`)으로 직접 API 호출 | ❌ 금지 | 2026년 1월 Anthropic이 제3자 앱의 OAuth 토큰 사용 차단. 클라이언트 핑거프린팅으로 공식 CLI 여부 검증 |
| `claude -p` (headless mode) 실행 | ✅ 허용 | 공식 문서에서 CI/CD, 스크립팅, 자동화 용도로 명시적 허용 |
| Agent SDK + OAuth Token | ❌ 금지 | 2026년 2월 법률/컴플라이언스 문서에서 "Agent SDK는 API Key 인증 필수" 명시 |
| CLIProxyAPI (프록시 방식) | ⚠️ 회색지대 | `claude -p` 앞에 OpenAI 호환 프록시를 두는 방식. 기술적으로 동작하나 ToS 위반 리스크 |

**Anthropic 공식 입장** (2026년 2월):
> "OAuth authentication is intended exclusively for Claude Code and Claude.ai. Using OAuth tokens in any other product, tool, or service is not permitted."

→ **`claude -p`를 직접 호출하는 것만이 합법적 경로**

#### A2. OAuth Token 발급 절차

- `claude login` → 브라우저 OAuth 인증 → 토큰 자동 저장 (`~/.claude/` 디렉토리)
- `--no-browser` 플래그로 headless 서버에서도 인증 가능 (device code flow)
- 토큰 접두사: `sk-ant-oat01-` (구독 기반)

#### A3. 구독 토큰 Rate Limit

| 플랜 | 5시간 윈도우 | 주간 한도 | 월 비용 |
|------|:-----------:|:---------:|:------:|
| Pro | ~44,000 토큰 | 있음 | $20 |
| Max 5x | ~88,000 토큰 | 있음 | $100 |
| Max 20x | ~220,000 토큰 | 있음 | $200 |

- "메시지" 단위는 토큰 소비량 가중 — 짧은 프롬프트 ~500토큰(1 메시지), 긴 대화+파일 ~50,000토큰(10-15 메시지)
- **Max 20x에서도 5시간당 ~220K 토큰** → Radar 배치(아이템당 ~2K-5K 토큰)로 계산하면 5시간에 44~110건 처리 가능
- 한도 초과 시 API 요금으로 추가 사용 가능 (Max 플랜)

#### A4. Claude Code CLI 원격 실행

| 환경 | 가능 여부 | 방법 |
|------|:---------:|------|
| SSH + `claude -p` | ✅ | SSH로 원격 서버 접속 후 `claude -p "프롬프트"` 실행 |
| Docker 컨테이너 | ✅ | 컨테이너 내 claude CLI 설치 + OAuth 인증 |
| GitHub Actions | ✅ | 공식 지원 — `ANTHROPIC_API_KEY` 또는 OAuth 인증 |
| Cloudflare Worker 내 직접 실행 | ❌ | Worker는 Node.js 런타임 아님, CLI 실행 불가 |
| Remote Control (claude.ai/code) | ✅ | 2026년 2월 리서치 프리뷰 — 로컬 세션을 원격에서 제어 |

**핵심**: Cloudflare Worker에서 직접 `claude -p`를 실행할 수 없으므로, **외부 서버가 필수**.

---

### 3.2 탐구 영역 B: 배치 처리 아키텍처 (조사 예정)

> Phase 1 조사 후 아키텍처 선택 시 상세화 예정

**현재 파악된 구조**:
```
현재:  [Cron Trigger] → [CF Worker] → [Anthropic API + API Key] → [D1 저장]
                                       ↑ Credit 소비

목표:  [Cron/Queue]   → [외부 서버]  → [claude -p + 구독 토큰]  → [D1 저장 (API)]
                                       ↑ 구독 토큰 (추가 비용 0)
```

**기존 `/ax-batch-analysis` 스킬**이 이미 "Claude Code 구독으로 AI 분석 처리, API Credit 소비 없이" 동작 중 — 이것이 바로 `claude -p` 패턴의 실현체.

→ **핵심 질문**: `/ax-batch-analysis`의 현재 패턴을 **프로덕션 자동화**(Cron + 외부 서버)로 확장할 수 있는가?

---

### 3.3 탐구 영역 C: 비용 모니터링

#### C1. Anthropic Admin API — Usage & Cost

**결론: Admin API Key로 상세 조회 가능**

| API | Endpoint | 기능 |
|-----|----------|------|
| Usage API | `GET /v1/organizations/usage_report/messages` | 토큰 사용량 (모델별/API Key별/워크스페이스별) |
| Cost API | `GET /v1/organizations/cost_report` | USD 비용 (일별, 서비스별) |
| Claude Code Analytics | `GET /v1/organizations/usage_report/claude_code` | 사용자별 세션/LOC/커밋/토큰/비용 |

**인증**: Admin API Key (`sk-ant-admin...`) 필요 — Organization 관리자만 발급 가능

**Usage API 상세**:
- 시간 단위: `1m` (분), `1h` (시간), `1d` (일)
- 필터: 모델, API Key, 워크스페이스, 서비스 티어, 추론 지역
- 그룹핑: `group_by[]=model&group_by[]=workspace_id`
- 데이터 신선도: API 호출 후 **~5분** 내 반영
- 폴링 권장: 분당 1회

**Cost API 상세**:
- 일별(`1d`) 단위만 지원
- USD 센트 단위 소수점 문자열
- 워크스페이스별, 설명별 그룹핑

**Claude Code Analytics API** (DX-REQ-011에 가장 유용):
- **사용자별** 일간 집계: 세션 수, LOC 추가/삭제, 커밋, PR
- **모델별** 토큰 사용량 + 예상 비용 (USD 센트)
- `customer_type` 필드: `api` (PAYG) vs `subscription` (Pro/Team) 구분
- 데이터 신선도: **~1시간** 내 반영

```bash
# 예시: 일일 사용량 조회
curl "https://api.anthropic.com/v1/organizations/usage_report/messages?\
starting_at=2026-03-01T00:00:00Z&\
ending_at=2026-03-10T00:00:00Z&\
group_by[]=model&\
bucket_width=1d" \
  --header "anthropic-version: 2023-06-01" \
  --header "x-api-key: $ADMIN_API_KEY"
```

#### C2. Credit 잔액 직접 조회

- Anthropic Console Billing 페이지에서 확인 가능하나, **잔액 조회 전용 API는 미확인**
- Usage/Cost API로 **소비량을 추적**하고, 초기 충전액에서 차감하는 방식으로 추정 가능
- Partner 솔루션: CloudZero, Datadog, Grafana Cloud, Honeycomb 등에서 Anthropic 연동 제공

#### C4. 사용자별 소비량 귀속

**현재 한계**: `token_usage_logs`에 `userId` 필드가 있지만, `TokenBudgetManager.getMonthlyUsage()`는 `conversations` 테이블 조인으로 귀속 → Cron/배치 분석은 conversation 없이 실행되므로 귀속 불가

**개선 방안**:
1. Cron/배치 분석 시에도 `userId`를 `token_usage_logs`에 직접 기록
2. Admin API의 Claude Code Analytics로 API Key 기반 사용자 귀속 보조

---

## 4. 아키텍처 결정

### 4.1 Option B 탈락: OAuth Token 직접 API 호출

Anthropic이 2026년 1월부터 OAuth 토큰의 제3자 사용을 차단했으므로 **Option B는 불가능**.

### 4.2 권장: Option A + Option C 하이브리드

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Discovery-X 비용 최적화                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [경로 1: 실시간 — 기존 유지]                                         │
│  사용자 채팅/즉석 분석 → FallbackManager → API Key (Credit 소비)      │
│                                                                     │
│  [경로 2: 배치 — 신규]                                                │
│  Cron Trigger → 외부 서버 → claude -p (구독 토큰, Credit 0)           │
│  대상: Radar 시장조사, Ideas 분석, Ontology 추출                      │
│                                                                     │
│  [경로 3: 모니터링 — 신규]                                             │
│  Admin API → Usage/Cost/Analytics 조회 → 대시보드 + 알림              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**분리 원칙**:
- **실시간 대화** (채팅, 즉석 분석): API Key 유지 — 지연 시간 중요, 소비량 상대적 적음
- **배치 분석** (Radar, Ideas, Ontology): `claude -p` 전환 — 지연 허용, 대량 소비 → 구독 토큰이 경제적
- **모니터링**: Admin API로 양쪽 비용 통합 추적

---

## 5. 실행 계획 (수정)

### Phase 1: 모니터링 체계 구축 (1 세션) — 즉시 실행 가능

1. [ ] Admin API Key 발급 (`sk-ant-admin...`)
2. [ ] Anthropic Usage/Cost API 연동 — Cron Worker로 일간 폴링
3. [ ] 관리자 대시보드에 비용 위젯 추가 (일별 사용량 + 누적 비용)
4. [ ] 비용 임계치 알림 (Slack/이메일)

### Phase 2: 배치 분석 전환 (2~3 세션) — 외부 서버 필요

5. [ ] 배치 실행 서버 구성 (VPS 또는 GitHub Actions self-hosted runner)
6. [ ] `claude -p` + `--output-format json` 기반 배치 분석 스크립트 작성
7. [ ] 현재 Cron API(`api.cron.ai-pipeline`)에서 배치 경로 분기 구현
8. [ ] D1 결과 저장 API 호출 (배치 서버 → CF Worker API)

### Phase 3: 사용자별 비용 추적 (1 세션)

9. [ ] `token_usage_logs`에 Cron/배치 분석의 userId 직접 기록
10. [ ] Claude Code Analytics API 연동 (API 사용자 비용 추적)
11. [ ] 관리자 대시보드에 사용자별 소비량 뷰 추가

---

## 6. Risks and Mitigation (수정)

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| `claude -p` 자동화가 "ordinary individual usage" 범위 초과 시 ToS 위반 | High | Low | 배치 처리량을 Max 20x rate limit 이내로 제한 (5시간당 ~110건) |
| 구독 rate limit이 배치 처리에 부족 | Medium | **High** | 큐 기반 throttling + 한도 초과분은 API Key fallback |
| 외부 서버 운영 비용 > API Credit 절감액 | Medium | Low | 저비용 VPS ($5/월) 또는 GitHub Actions 무료 티어 활용 |
| Admin API Key 보안 노출 | High | Low | 환경변수 격리, 최소 권한 원칙 |
| 배치 서버 ↔ D1 네트워크 지연 | Low | Medium | 비동기 큐 패턴, 재시도 로직 |

---

## 7. 비용 시뮬레이션

### 현재 (API Credit 소비)

| 항목 | 월간 예상 | 산출 근거 |
|------|:---------:|----------|
| Radar 배치 (시장조사) | ~$30-50 | 아이템당 ~3K 토큰 × 200건/월 × $15/1M |
| Ideas 분석 | ~$10-20 | 아이템당 ~2K 토큰 × 100건/월 |
| Agent 채팅 | ~$20-40 | 대화당 ~10K 토큰 × 100건/월 |
| **총 API Credit** | **~$60-110** | |

### 전환 후 (하이브리드)

| 항목 | 월간 예상 | 변경 |
|------|:---------:|------|
| Radar/Ideas 배치 (claude -p) | $0 | 구독 토큰 사용 |
| Agent 채팅 (API Key) | ~$20-40 | 기존 유지 |
| Max 구독 | $100 또는 $200 | 월정액 (이미 사용 중이면 추가 비용 0) |
| VPS 서버 | ~$5 | 배치 실행용 |
| **총 비용** | **~$25-45 + 기존 구독** | 배치 비용 $40-70 절감 |

> **Claude Code 구독을 이미 개발용으로 사용 중이라면**, 배치 분석 추가 비용은 VPS $5/월만 발생 → 배치 API Credit $40-70 절감

---

## 8. Next Steps

1. [x] ~~탐구 영역 A 완료~~ — 구독 토큰 활용 가능성 확인
2. [x] ~~탐구 영역 C 완료~~ — Admin API 스펙 확인
3. [ ] **다음**: Phase 1 실행 — Admin API Key 발급 + 비용 모니터링 위젯
4. [ ] Phase 2 설계 — 배치 서버 구성 + `claude -p` 스크립트 설계
5. [ ] 선택된 옵션으로 Design 문서 작성

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-10 | Initial draft — 탐구 계획 + 후보 아키텍처 | Sinclair Seo |
| 0.2 | 2026-03-10 | 탐구 영역 A+C 조사 완료 — 아키텍처 결정 + 비용 시뮬레이션 | Sinclair Seo |
