---
code: DX-DSGN-008
title: Radar 스코어링 전략
version: 1.0
status: Active
category: DSGN
created: 2026-03-07
updated: 2026-03-07
author: Sinclair Seo
---

# Radar Scoring Strategy

> radar-worker AI 스코어링 아키텍처 개선 전략

## 1. 현재 아키텍처

### 파이프라인 흐름

```
radar-worker (CF Worker, cron 0:00 UTC / 9:00 KST)
  │
  ├─ 1. 수집: RSS / Web / YouTube (radar_sources 기반)
  ├─ 2. 중복 제거: URL hash → FTS5 title 유사도
  ├─ 3. AI 스코어링: OpenAI gpt-4o-mini (배치 20건)
  ├─ 4. Seed 생성: relevanceScore >= 60인 상위 5건 → discoveries INBOX
  └─ 5. 기록: 나머지 아이템 radar_items에 저장
```

### 주요 구성 요소

| 파일 | 역할 |
|------|------|
| `src/index.ts` | Cron + HTTP 엔트리포인트 (`/run?secret=`, `/health`) |
| `src/pipeline.ts` | 전체 파이프라인 오케스트레이션 |
| `src/scorer.ts` | OpenAI API 호출 (gpt-4o-mini, temp 0.3) |
| `src/seed-creator.ts` | 고점수 아이템 → Discovery INBOX 생성 |
| `src/dedup.ts` | URL hash + FTS5 2단계 중복 제거 |
| `src/types.ts` | `Env` 인터페이스 (`AI: Ai` 바인딩 선언 포함) |
| `wrangler.toml` | D1 바인딩, vars (`RELEVANCE_THRESHOLD=60`, `MAX_SEEDS_PER_RUN=5`) |

### 현재 문제

```
OpenAI API 크레딧 소진
  → scorer.ts catch 블록 → relevanceScore: 0 fallback
    → 모든 아이템이 threshold(60) 미달
      → seed 생성 0건 (사일런트 실패)
        → 수집은 계속되나 실질적 데이터 축적 중단
```

**핵심 이슈**: 에러가 `console.error`로만 기록되고 stats에 반영되지 않아 장애 인지 지연.

### 기존 자산

- `types.ts`에 `AI: Ai` (Workers AI 바인딩)과 `ANTHROPIC_API_KEY`가 이미 선언됨
- `wrangler.toml`에는 `[ai]` 바인딩 미설정 (선언만 있고 활성화 안 됨)
- Main app(`app/lib/ai/`)에 `FallbackManager` 구현 완료 — Anthropic → OpenAI → Google → Workers AI 체인


## 2. 즉시 개선 — Fallback 체인

### 목표

OpenAI 실패 시 자동으로 다음 프로바이더로 전환하여 무중단 스코어링 보장.

### Fallback 순서

```
OpenAI (gpt-4o-mini)
  └─ 실패 → Anthropic (claude-3-5-haiku)
               └─ 실패 → Workers AI (llama-3.1-8b-instruct)
```

| 순서 | 프로바이더 | 모델 | JSON 모드 | 비용 |
|------|-----------|------|-----------|------|
| 1 | OpenAI | gpt-4o-mini | `response_format: json_object` | ~$0.15/1M input |
| 2 | Anthropic | claude-3-5-haiku | 프롬프트 지시 | ~$0.25/1M input |
| 3 | Workers AI | @cf/meta/llama-3.1-8b-instruct | 프롬프트 지시 | 무료 (CF plan 포함) |

### 크레딧 소진 감지 기준

| 프로바이더 | 감지 조건 |
|-----------|----------|
| OpenAI | HTTP 429 또는 `insufficient_quota` / `billing_hard_limit_reached` |
| Anthropic | HTTP 429 또는 `credit_balance_too_low` |
| Workers AI | 바인딩 호출이므로 HTTP 에러 없음 (모델 자체 에러만) |

### wrangler.toml 변경 필요

```toml
[ai]
binding = "AI"
```

### 시크릿 추가

```bash
wrangler secret put ANTHROPIC_API_KEY  # main app과 동일 키 재사용
```


## 3. 중기 방안 — 내부 구독 토큰 활용

### 방안 A: Claude API (Anthropic 엔터프라이즈 / Max 구독)

Claude Max/Team 구독으로 API 크레딧을 확보하여 Anthropic을 1순위로 승격.

| 항목 | 내용 |
|------|------|
| 모델 | claude-3-5-haiku (스코어링용), claude-sonnet-4-5 (고정밀 필요 시) |
| 장점 | 고품질 스코어링, 한국어 능숙, main app 키 재사용 |
| 단점 | 월 구독 비용, API 호출량 제한 있을 수 있음 |
| 적합 시나리오 | 팀 내 Anthropic 엔터프라이즈 계약이 이미 있는 경우 |

### 방안 B: Codex Agent 배치 스코어링

OpenAI Codex/Agent 기능으로 스코어링을 배치 작업으로 실행.

| 항목 | 내용 |
|------|------|
| 방식 | Codex Agent에 스코어링 태스크 제출 → 비동기 결과 수신 |
| 장점 | 대량 처리 가능, 기존 OpenAI 구독 토큰 활용 |
| 단점 | Agent 기반이라 latency 높음, 실시간 불가, API 안정성 미검증 |
| 적합 시나리오 | OpenAI 구독이 활성 상태이고 배치 지연 허용 가능한 경우 |

### 방안 C: Workers AI 우선 활용 (권장)

CF Workers AI 내장 모델을 1순위로 사용. 외부 API 의존성 완전 제거.

| 항목 | 내용 |
|------|------|
| 모델 | `@cf/meta/llama-3.1-8b-instruct` (또는 향후 더 큰 모델) |
| 장점 | 추가 비용 0 (CF plan 포함), latency 최소 (~100ms), 외부 의존성 없음 |
| 단점 | 모델 품질 낮음 (한국어 번역 정확도, 관련성 판단 정밀도 이슈 가능) |
| 적합 시나리오 | 비용 최소화 우선, 품질은 threshold 조정으로 보완 가능한 경우 |

**품질 보완 전략**:

1. **Threshold 조정**: Workers AI 모델의 점수 분포를 분석 후 threshold 하향 (60 → 40~50)
2. **2단계 필터링**: Workers AI로 1차 필터 (상위 30%) → Anthropic/OpenAI로 2차 정밀 스코어링
3. **프롬프트 최적화**: 스코어링 기준을 더 명시적으로 제공, few-shot 예시 추가

### 방안 D: Claude Code CLI Agent (신규)

`claude -p` 명령으로 배치 파이프라인 구성. 내부 Claude Code 구독 토큰 소진.

| 항목 | 내용 |
|------|------|
| 방식 | 로컬/서버에서 `claude -p "score these items: ..."` 실행 |
| 장점 | 구독 내 사실상 무제한 사용량, 최고 품질 (Opus/Sonnet) |
| 단점 | CLI 기반이라 CF Worker Cron에 직접 통합 불가, 별도 스케줄러 필요 (crontab / GitHub Actions) |
| 적합 시나리오 | Claude Code Max 구독 보유 + 서버리스 제약 우회 가능한 경우 |

**구현 시 아키텍처 변경**:

```
기존: CF Worker Cron → scorer.ts (직접 API 호출)
변경: GitHub Actions Cron → claude -p (스코어링) → D1 REST API (결과 저장)
      또는 로컬 crontab → claude -p → wrangler d1 execute
```


## 4. 비용 비교표

| 방안 | 월 예상 비용 | 일일 처리량 (아이템) | 품질 수준 | 구현 난이도 | 외부 의존성 |
|------|------------|---------------------|----------|-----------|-----------|
| 현재 (OpenAI only) | ~$3-5 | ~100 | 높음 | - | OpenAI API |
| A. Claude API | ~$5-10 | ~100 | 높음 | 낮음 | Anthropic API |
| B. Codex Agent | ~$5-10 | ~100 (배치) | 중상 | 중간 | OpenAI Agent API |
| C. Workers AI | $0 | ~100 | 중 | 낮음 | 없음 |
| D. Claude Code CLI | $0 (구독 포함) | ~50-100 | 최고 | 높음 | 로컬/CI 스케줄러 |
| Fallback 체인 (2안) | $0~5 (상황별) | ~100 | 높음→중 | 낮음 | 복합 |

> **비용 산출 기준**: 일일 ~100 아이템 수집, 배치 20건씩 5회 호출, 입력 ~500토큰/아이템, 출력 ~200토큰/아이템


## 5. 권장 전략

### Phase 1: 즉시 (1~2일) — Workers AI Fallback 적용

**목표**: 무중단 수집 복구

- `wrangler.toml`에 `[ai]` 바인딩 추가
- `scorer.ts`에 3단계 fallback 구현: OpenAI → Anthropic → Workers AI
- 스코어링 실패 시 stats.errors에 프로바이더 정보 기록 (사일런트 실패 제거)
- `ANTHROPIC_API_KEY` 시크릿 등록

**검증**: `/run?secret=` 수동 트리거로 전체 파이프라인 성공 확인

### Phase 2: 1~2주 — Workers AI 품질 평가

**목표**: Workers AI 단독 운용 가능 여부 판단

- 1주간 OpenAI를 비활성화하고 Workers AI만으로 운용
- 생성된 seed의 관련성 점수 분포 분석
- 한국어 번역 품질 검수 (titleKo, summaryKo)
- threshold 최적화 (60 유지 또는 하향 조정)

**판단 기준**:
- 일일 seed 생성 수가 기존 대비 50% 이상 유지 → 합격
- 한국어 번역이 의미 전달 가능 → 합격
- 둘 중 하나라도 미달 → Phase 3로 진행

### Phase 3: 1개월 — 품질 부족 시 보완

**옵션 A**: 2단계 필터링 도입

```
Workers AI (1차) → 상위 30% 필터 → Anthropic haiku (2차 정밀)
```

**옵션 B**: Claude Code CLI 배치 도입 (방안 D)

```
GitHub Actions daily cron → claude -p 스코어링 → D1 API 저장
```

**옵션 C**: Workers AI 전용 유지 + 프롬프트 고도화

- Few-shot 예시 5~10건 추가
- 점수 기준 세분화 (현재 0-100 단일 → 카테고리별 가중치)


## 부록: Main App FallbackManager 참조

Main app(`app/lib/ai/fallback-manager.ts`)에 이미 구현된 FallbackManager 패턴:

```
체인: anthropic → openai → google → workers-ai
감지: isCreditExhausted() → markFailed() → 다음 프로바이더
상태: FailedProvider[] (런타임 메모리, 요청 단위)
```

radar-worker의 scorer fallback 구현 시 이 패턴을 참조하되, 더 단순하게 구현 가능:
- radar-worker는 일일 1회 실행이므로 런타임 상태 관리 불필요
- 순차 try/catch로 충분 (FallbackManager 클래스화 불필요)
