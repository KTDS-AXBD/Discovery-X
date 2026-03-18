---
code: DX-ANLS-018
title: "F48 Generative UI — Gap Analysis v1.0"
version: "1.0"
status: Active
category: ANLS
created: 2026-03-18
updated: 2026-03-18
author: Sinclair Seo
---

# F48 Generative UI — Gap Analysis v1.0

> **Design**: [[DX-DSGN-018]] v0.1
> **Plan**: [[DX-PLAN-011]] v0.1
> **Req**: DX-REQ-018 (F48, P2)

---

## 1. Executive Summary

| 항목 | 값 |
|------|-----|
| **Overall Match Rate** | **54%** (19 / 35) |
| GREEN (완전 구현) | 19건 |
| YELLOW (부분 구현) | 4건 |
| RED (미구현) | 12건 |
| **Phase 1 커버리지** | ~85% (UI 컴포넌트 + lib 유틸리티 + ChatPanel 통합) |
| **Phase 2 커버리지** | ~0% (Agent 도구 스키마 + handler + registry + system-prompt 전무) |
| **Phase 3 커버리지** | ~25% (다크/라이트 전환만 구현, 액션 연동 / 위젯 캐시 미구현) |

### 핵심 요약

Phase 1(WidgetRenderer 기본)은 거의 완성 상태이다. `WidgetRenderer`, `WidgetSkeleton`, `WidgetErrorFallback` 3개 UI 컴포넌트, `widget-sanitizer.ts`, `widget-theme.ts`, `widget-protocol.ts` 3개 lib 유틸리티, ChatPanel SSE 통합, DB 스키마 + 마이그레이션 + 테스트 헬퍼까지 모두 구현 완료. 그러나 Phase 2(Agent Tool 연동)가 전혀 미구현이므로 실제로 위젯이 생성되지 않는다. Agent가 `render_widget` 도구를 사용할 수 없는 상태.

| Perspective | Content |
|-------------|---------|
| **Feature** | F48 Generative UI — Agent 채팅 인터랙티브 시각화 |
| **기간** | 2026-03-18 (세션 내 구현) |
| **Match Rate** | 54% (GREEN 19 / 전체 35) |
| **Value Delivered** | Phase 1 기반 인프라 완비 — sandboxed iframe + PostMessage 프로토콜 + 보안 6계층 + 테마 동기화. Agent Tool 연동(Phase 2) 완료 시 즉시 동작 가능 |

---

## 2. Gap Items 총괄 테이블

| ID | Design 항목 | 상태 | 구현 파일:줄번호 | 갭 설명 |
|----|------------|------|-----------------|---------|
| G01 | WidgetRenderer 컴포넌트 | 🟢 GREEN | `chat/ui/WidgetRenderer.tsx:61-211` | 설계대로 완전 구현. data-widget-id 속성 추가 (설계 이상) |
| G02 | WidgetSkeleton 컴포넌트 | 🟢 GREEN | `chat/ui/WidgetSkeleton.tsx:1-21` | shimmer + title + role/aria-label 완전 일치 |
| G03 | WidgetErrorFallback 컴포넌트 | 🟢 GREEN | `chat/ui/WidgetErrorFallback.tsx:1-35` | 에러 메시지 + JSON fallback 완전 구현 |
| G04 | PostMessage 리스너 (resize/action/error) | 🟢 GREEN | `chat/ui/WidgetRenderer.tsx:76-105` | 3개 이벤트 타입 모두 처리 |
| G05 | Origin 검증 (event.origin + event.source) | 🟢 GREEN | `chat/ui/WidgetRenderer.tsx:79-81` | `"null"` origin + contentWindow source 이중 검증 |
| G06 | widget: 접두사 필터링 | 🟢 GREEN | `chat/ui/WidgetRenderer.tsx:84` | `msg.type.startsWith("widget:")` |
| G07 | 렌더링 타임아웃 5초 | 🟢 GREEN | `chat/ui/WidgetRenderer.tsx:113-123` | RENDER_TIMEOUT_MS = 5_000, 마운트 1회 설정 (설계 개선) |
| G08 | iframe onLoad → widget:init postMessage | 🟢 GREEN | `chat/ui/WidgetRenderer.tsx:126-138` | data + theme 전달. targetOrigin "*" |
| G09 | iframe sandbox="allow-scripts" | 🟢 GREEN | `chat/ui/WidgetRenderer.tsx:199` | `sandbox="allow-scripts"` — allow-same-origin 등 미설정 |
| G10 | iframe srcdoc 기반 (src 속성 미사용) | 🟢 GREEN | `chat/ui/WidgetRenderer.tsx:198` | `srcDoc={srcdoc}` — 외부 URL 로드 차단 |
| G11 | 높이 클램핑 (maxHeight + MAX_WIDGET_HEIGHT) | 🟢 GREEN | `chat/ui/WidgetRenderer.tsx:90-92` | `Math.min(height, Math.min(maxHeight, MAX_WIDGET_HEIGHT))` |
| G12 | 위젯 헤더 (타입 아이콘 + 제목 + 위젯타입 레이블) | 🟢 GREEN | `chat/ui/WidgetRenderer.tsx:180-186` | WidgetTypeIcon + title + widgetType 레이블 |
| G13 | sanitize 실패 시 즉시 에러 반환 | 🟢 GREEN | `chat/ui/WidgetRenderer.tsx:159-170` | try/catch → WidgetErrorFallback |
| G14 | widget-sanitizer.ts | 🟢 GREEN | `chat/lib/widget-sanitizer.ts:1-65` | 9개 DANGEROUS_PATTERNS + 10KB 제한 + 네트워크 경고. lastIndex 리셋 추가 (설계 개선) |
| G15 | widget-theme.ts (THEME_VARS + buildSrcdoc) | 🟢 GREEN | `chat/lib/widget-theme.ts:1-108` | 15개 CSS 변수 + CSP meta + ResizeObserver + widget:init/theme-change 핸들러. ES5 문법 사용 (브라우저 호환 개선) |
| G16 | widget-protocol.ts (타입 정의 + 타입 가드) | 🟢 GREEN | `chat/lib/widget-protocol.ts:1-85` | 6개 메시지 타입 + WidgetMessage 유니언 + isWidgetMessage() 타입 가드 + ChatWidget/RenderWidgetResult 타입 |
| G17 | ChatPanel SSE widget 이벤트 처리 | 🟢 GREEN | `chat/ui/ChatPanel.tsx:237-248` | `event.type === "widget"` 분기 → widgets state 축적 |
| G18 | ChatPanel WidgetRenderer 렌더링 | 🟢 GREEN | `chat/ui/ChatPanel.tsx:419-428` | `widgets.map()` → WidgetRenderer 렌더링 |
| G19 | chatWidgets DB 스키마 + 마이그레이션 + 테스트 헬퍼 | 🟢 GREEN | `chat/db/schema.ts:101-125`, `drizzle/0067_chat_widgets.sql`, `tests/helpers/db.ts:98` | 스키마, SQL, 테스트 헬퍼 모두 완비. tenantId 추가 (설계 이상) |
| G20 | 다크/라이트 모드 MutationObserver | 🟢 YELLOW | `chat/ui/WidgetRenderer.tsx:141-155` | MutationObserver로 class/data-theme 감지하여 widget:theme-change 전송. 설계대로 구현되었으나 테스트 미커버 |
| G21 | CSP meta 태그 (connect-src 'none' 등) | 🟢 GREEN | `chat/lib/widget-theme.ts:46-47` | 8개 CSP 지시어 모두 포함 (default-src, script-src, style-src, img-src, font-src, connect-src, frame-src, object-src, base-uri) |
| G22 | ToolExecution.tsx — render_widget case 분기 | 🔴 RED | — | ToolExecution.tsx에 render_widget case 미추가. 위젯은 ChatPanel에서 직접 렌더링하므로 부분적 대안 존재 |
| G23 | widget-schemas.ts (render_widget 도구 스키마) | 🔴 RED | — | tool-schemas/ 디렉토리에 widget-schemas.ts 파일 미생성. Agent가 render_widget을 도구로 인식할 수 없음 |
| G24 | tool-schemas/index.ts — WIDGET_TOOLS export | 🔴 RED | — | index.ts에 WIDGET_TOOLS export 미추가 |
| G25 | tool-registry.ts — WIDGET_TOOLS 등록 | 🔴 RED | — | tool-registry에 render_widget 미등록. Agent autonomy level과 무관하게 도구 노출 안 됨 |
| G26 | tool-handler — render_widget 실행 (agent-pipeline) | 🔴 RED | — | processToolBlocks() 내 render_widget case 미구현. sanitize → DB 저장 → 결과 반환 흐름 미존재 |
| G27 | executor-stream.ts — widget SSE 이벤트 전송 | 🔴 RED | — | executor-stream에 widget 관련 코드 없음. tool_call 이벤트에 render_widget 결과를 widget으로 변환하는 로직 필요 |
| G28 | system-prompt.ts — 위젯 생성 가이드 | 🔴 RED | — | system-prompt에 위젯 코드 생성 규칙/예시 미추가. Agent가 render_widget 사용 시 가이드라인 필요 |
| G29 | widget-templates/ (6종 기본 위젯 HTML 템플릿) | 🔴 RED | — | Plan §5.3에서 정의한 chart-bar, chart-line, chart-pie, diagram-flow, table-interactive, metric-card 템플릿 미생성 |
| G30 | 대화당 최대 5개 위젯 동시 렌더링 제한 | 🔴 RED | — | Design §4.3 Layer 6에서 명시. ChatPanel이나 WidgetRenderer에 제한 로직 없음 |
| G31 | widget:action 호스트 라우팅 연동 (Phase 3) | 🟡 YELLOW | `chat/ui/WidgetRenderer.tsx:95-96` | `console.log`만 존재 — Phase 3 예정으로 의도적 미완. navigate/filter/select/send-prompt 액션 핸들러 필요 |
| G32 | widget:open-link 호스트 처리 | 🔴 RED | — | widget-protocol.ts에 WidgetOpenLinkMessage 타입은 정의되었지만, WidgetRenderer의 handleMessage에서 처리하지 않음 |
| G33 | 위젯 캐시 (대화별 srcdoc 캐시) | 🟡 YELLOW | — | Design §7 및 Plan Phase 3에서 명시. chatWidgets DB 테이블은 존재하지만, 재렌더링 방지/캐시 조회 로직 미구현 |
| G34 | 위젯 코드 10KB 제한 (Agent 도구 스키마 레벨) | 🟡 YELLOW | `chat/lib/widget-sanitizer.ts:1` | sanitizer에서 10KB 제한 작동하지만, Agent 도구 스키마의 description에 10KB 제한 안내가 없음 (도구 미생성) |
| G35 | SSEWidget 타입에 description 필드 | 🔴 RED | `chat/ui/ChatPanel.tsx:29-34` | SSEWidget 인터페이스에 description 필드 미포함. Design §6.1에서 정의한 description(접근성 + 로깅용) 누락 |

---

## 3. GREEN Items (구현 완료) — 19건

### 3.1 UI 컴포넌트 (G01~G03, G12~G13)

**WidgetRenderer** (`app/features/chat/ui/WidgetRenderer.tsx:61-211`):
- 설계의 핵심 구조를 충실히 구현: props 인터페이스, 4-state 머신(loading/ready/error/timeout), iframe srcdoc 렌더링
- 설계 대비 개선점: `data-widget-id` 속성 추가(디버깅), sanitize 실패 시 try/catch 에러 바운더리, 타임아웃을 마운트 1회로 최적화 (eslint-disable 주석 포함)

**WidgetSkeleton** (`app/features/chat/ui/WidgetSkeleton.tsx:1-21`):
- 설계와 1:1 대응. shimmer 3줄 + "렌더링 중..." 텍스트 + ARIA 접근성 속성

**WidgetErrorFallback** (`app/features/chat/ui/WidgetErrorFallback.tsx:1-35`):
- 에러 아이콘(SVG) + 메시지 + JSON fallback `<pre>` 블록. 설계와 일치

### 3.2 PostMessage 프로토콜 (G04~G06)

- `handleMessage` 콜백: origin `"null"` 검증 → source 검증 → `widget:` 접두사 필터 → resize/action/error switch 분기
- 설계 §3의 프로토콜 시퀀스 그대로 구현

### 3.3 iframe 보안 (G07~G11, G21)

- `sandbox="allow-scripts"` 단일 허용 — allow-same-origin/forms/popups/navigation 모두 차단
- `srcDoc` 전용 — 외부 URL 로드 원천 차단
- CSP meta 태그 8개 지시어: `default-src 'none'`, `script-src 'unsafe-inline'`, `style-src 'unsafe-inline'`, `img-src data: blob:`, `font-src data:`, `connect-src 'none'`, `frame-src 'none'`, `object-src 'none'`, `base-uri 'none'`
- 5초 타임아웃 → timeout 상태 → WidgetErrorFallback

### 3.4 lib 유틸리티 (G14~G16)

**widget-sanitizer.ts** (`app/features/chat/lib/widget-sanitizer.ts:1-65`):
- 9개 DANGEROUS_PATTERNS (설계 §4.4 일치)
- 10KB 사이즈 제한, blocked/warnings 구조
- 개선점: `pattern.lastIndex = 0` 리셋 추가 (글로벌 정규식 버그 방지)

**widget-theme.ts** (`app/features/chat/lib/widget-theme.ts:1-108`):
- THEME_VARS 15개 (설계 §5.1 일치)
- buildThemeStyleBlock, buildSrcdoc 함수
- srcdoc 내부: ResizeObserver, widget:init/theme-change 핸들러, onerror 핸들러, 초기 높이 보고
- 개선점: ES5 문법(`var`, `function` 키워드) 사용 — iframe 내부 호환성 강화

**widget-protocol.ts** (`app/features/chat/lib/widget-protocol.ts:1-85`):
- 6개 메시지 타입 인터페이스 (설계 §3.1 일치)
- HostToIframeMessage, IframeToHostMessage, WidgetMessage 유니언
- `isWidgetMessage()` 타입 가드 (설계에 없지만 유용한 추가)
- ChatWidget, RenderWidgetResult 인터페이스 (설계 §8.4, §8.5 일치)

### 3.5 ChatPanel 통합 (G17~G18)

- SSE 파싱에 `event.type === "widget"` 분기 추가 (`ChatPanel.tsx:237-248`)
- `widgets` state 배열로 축적 → `widgets.map()` → WidgetRenderer 렌더링 (`ChatPanel.tsx:419-428`)
- SSEWidget 인터페이스 정의 (`ChatPanel.tsx:28-34`)
- widgets를 scrollIntoView deps에 포함 (`ChatPanel.tsx:91`)

### 3.6 DB 스키마 + 마이그레이션 (G19)

**chatWidgets 스키마** (`app/features/chat/db/schema.ts:101-125`):
- 설계 §9.1과 일치: id, conversationId(FK CASCADE), widgetType, title, code, data(JSON), description, createdAt
- **설계 이상**: `tenantId` 컬럼 추가 (멀티테넌트 대비), `widgetType`에 `$type<WidgetType>()` 타입 힌트 적용
- ChatWidgetRecord, NewChatWidget 타입 export

**마이그레이션** (`drizzle/0067_chat_widgets.sql`):
- CREATE TABLE + CREATE INDEX 완비
- `randomblob(16)` 기반 기본 PK 생성 (설계의 UUID 대비 SQLite 최적화)
- tenantId FK 포함

**테스트 헬퍼** (`tests/helpers/db.ts:98`):
- `0067_chat_widgets.sql` 추가 완료

---

## 4. YELLOW Items (부분 구현) — 4건

### G20: 다크/라이트 모드 MutationObserver

- **구현 상태**: `WidgetRenderer.tsx:141-155`에서 `MutationObserver`로 `class`/`data-theme` 속성 변경 감지 → `widget:theme-change` postMessage 전송
- **부족한 점**: 이 기능에 대한 단위 테스트 미존재. JSDOM에서 MutationObserver 테스트가 어렵지만, 최소한 observer 등록/해제는 검증 가능

### G31: widget:action 호스트 라우팅 연동

- **구현 상태**: `WidgetRenderer.tsx:95-96`에서 `console.log("[Widget Action]", msg.action, msg.payload)` 로깅만 존재
- **의도적 미완**: "Phase 3에서 호스트 라우팅/Agent 재질문 연동" 주석. Plan Phase 3에서 예정된 사항
- **필요 작업**: navigate → Discovery 상세 이동, filter → Agent 재질문, select → 선택 아이템 처리, send-prompt → Agent 메시지 재전송

### G33: 위젯 캐시

- **구현 상태**: `chatWidgets` DB 테이블로 위젯 저장 인프라는 존재
- **부족한 점**: 대화 재진입 시 DB에서 위젯 조회 → 재렌더링하는 로직 미구현. 현재는 SSE 스트림 수신 시에만 위젯이 나타남. 스크롤 복귀/페이지 리로드 시 위젯 소실

### G34: 위젯 코드 10KB 제한 (Agent 도구 레벨)

- **구현 상태**: `widget-sanitizer.ts`에서 10KB 제한은 작동
- **부족한 점**: Agent 도구 스키마(`widget-schemas.ts`)가 미생성이므로, Agent가 도구 description에서 10KB 제한을 인지하지 못함. sanitizer는 방어적 백스톱이지만, LLM에게 제한을 알려야 코드 생성 시 준수 가능

---

## 5. RED Items (미구현) — 12건

### 5.1 Agent Tool 연동 (Phase 2 전체) — G22~G28

| ID | 항목 | 영향 | 우선순위 |
|----|------|------|----------|
| G23 | `widget-schemas.ts` (render_widget 도구 스키마) | Agent가 render_widget 도구를 인식할 수 없음 | **P0** |
| G24 | `tool-schemas/index.ts` WIDGET_TOOLS export | G23 종속 | **P0** |
| G25 | `tool-registry.ts` WIDGET_TOOLS 등록 | Agent에 도구 노출 안 됨 | **P0** |
| G26 | `tool-handler` render_widget 실행 | sanitize → DB 저장 → 결과 반환 플로우 미존재 | **P0** |
| G27 | `executor-stream.ts` widget SSE 이벤트 | 서버에서 widget 이벤트를 클라이언트에 전송하는 경로 미존재 | **P0** |
| G28 | `system-prompt.ts` 위젯 생성 가이드 | Agent가 코드 생성 규칙(인라인 전용, CSS 변수, `__WIDGET_DATA__`)을 알 수 없음 | **P1** |
| G22 | `ToolExecution.tsx` render_widget case | 현재 ChatPanel에서 직접 렌더링하므로 대안은 있으나, 설계의 ToolExecution 분기 방식이 더 자연스러움 | **P2** |

**핵심**: G23~G27 5건이 모두 구현되지 않으면 Generative UI 기능이 **전혀 동작하지 않는다**. Phase 1 인프라는 완비되었지만, Agent ↔ 클라이언트 연결 고리가 비어 있는 상태.

### 5.2 위젯 템플릿 — G29

- Plan §5.3에서 6종 기본 위젯 HTML 템플릿(chart-bar, chart-line, chart-pie, diagram-flow, table-interactive, metric-card) 정의
- 설계에서 `widget-templates/` 디렉토리로 신규 파일 계획
- Agent 시스템 프롬프트에 포함하여 data 교체만으로 위젯 생성 가능하게 하는 핵심 요소
- **우선순위**: P1 — system-prompt 가이드(G28)와 함께 구현 필요

### 5.3 위젯 동시 렌더링 제한 — G30

- Design §4.3 Layer 6: "대화당 최대 5개 위젯 동시 렌더링"
- ChatPanel의 `widgets.map()`에 제한 없음. iframe은 각각 별도 브라우저 컨텍스트를 생성하므로 메모리/CPU 부하
- **우선순위**: P2 — `widgets.slice(0, 5)` 또는 lazy loading으로 해결 가능

### 5.4 widget:open-link 처리 — G32

- `widget-protocol.ts`에 `WidgetOpenLinkMessage` 타입 정의 완료
- `WidgetRenderer.tsx`의 `handleMessage` switch에 `widget:open-link` case 미존재
- **우선순위**: P3 — iframe 내부에서 외부 링크 요청 시 호스트에서 `window.open()` 대리

### 5.5 SSEWidget description 필드 — G35

- `ChatPanel.tsx:29-34`의 `SSEWidget` 인터페이스에 `description` 필드 미포함
- Design §6.1에서 정의: 접근성 + 로깅용 선택 필드
- **우선순위**: P3 — 인터페이스에 `description?: string` 추가

---

## 6. 테스트 커버리지 분석

### 6.1 테스트 파일

| 파일 | 테스트 수 | 커버 범위 |
|------|----------|----------|
| `tests/unit/features/chat/widget-renderer.test.ts` | **25개** | sanitizer 9 + theme 8 + protocol 4 + height clamping 4 |

### 6.2 설계 테스트 계획 대비 현황

| 설계 ID | 테스트 대상 | 설계 예상 | 실제 | 상태 |
|---------|-----------|----------|------|------|
| U1 | widget-sanitizer | ~12 | 9 | 🟡 75% — 외부 CSS link 제거, object/embed 개별 테스트 미존재 |
| U2 | widget-theme | ~6 | 8 | 🟢 초과 — buildThemeStyleBlock(2) + buildSrcdoc(6) |
| U3 | widget-protocol | ~4 | 4 | 🟢 일치 — isWidgetMessage 타입 가드 양성/음성 |
| U4 | WidgetRenderer | ~10 | 4 | 🟡 40% — 높이 클램핑 로직만. iframe 렌더링/리사이즈/타임아웃/에러 UI는 JSDOM 한계로 미커버 |
| U5 | WidgetSkeleton | ~2 | 0 | 🔴 0% — 컴포넌트 렌더링 테스트 없음 |
| U6 | WidgetErrorFallback | ~2 | 0 | 🔴 0% — 컴포넌트 렌더링 테스트 없음 |
| I1 | render_widget 도구 통합 | ~6 | 0 | 🔴 0% — Phase 2 미구현으로 테스트 불가 |
| I2 | ChatPanel + Widget 통합 | ~4 | 0 | 🔴 0% — SSE → WidgetRenderer E2E 미테스트 |
| S1~S5 | 보안 테스트 | ~5 | 3 | 🟡 60% — XSS(S1), DOM 접근(S3~S4 부분), 사이즈(S5) 커버. 네트워크 차단(S2) 실제 CSP 검증 불가 |

### 6.3 테스트 커버리지 총괄

| 구분 | 설계 예상 | 실제 구현 | 비율 |
|------|----------|----------|------|
| 단위 테스트 | ~36 | 25 | 69% |
| 통합 테스트 | ~10 | 0 | 0% |
| 보안 테스트 | ~5 | 3 (단위 포함) | 60% |
| **합계** | **~46** (설계 §11.4) | **25** | **54%** |

---

## 7. Recommendations — 우선순위별 후속 작업

### P0: Phase 2 Agent Tool 연동 (기능 동작 필수)

| # | 작업 | 파일 | 예상 LOC |
|---|------|------|----------|
| 1 | `widget-schemas.ts` 생성 — render_widget 도구 스키마 | `chat/agent/tool-schemas/widget-schemas.ts` | ~40 |
| 2 | `tool-schemas/index.ts` — WIDGET_TOOLS export 추가 | `chat/agent/tool-schemas/index.ts` | 1줄 |
| 3 | `tool-registry.ts` — WIDGET_TOOLS 등록 (ADVISORY level) | `chat/agent/tool-registry.ts` | ~5 |
| 4 | tool-handler — render_widget case 추가 | `chat/agent/` (agent-pipeline 또는 별도 파일) | ~30 |
| 5 | executor-stream — widget SSE 이벤트 전송 또는 tool_call 내 분기 | 해당 파일 | ~15 |

### P1: Agent 가이드 + 위젯 템플릿

| # | 작업 | 파일 |
|---|------|------|
| 6 | system-prompt.ts — 위젯 생성 규칙 + CSS 변수 + `__WIDGET_DATA__` 가이드 | `chat/agent/system-prompt.ts` |
| 7 | widget-templates/ 6종 기본 템플릿 생성 (chart-bar, chart-line, chart-pie, diagram-flow, table-interactive, metric-card) | `chat/ui/widget-templates/` 또는 system-prompt 인라인 |

### P2: 보안 + 제한 + 테스트 보강

| # | 작업 |
|---|------|
| 8 | 대화당 최대 5개 위젯 동시 렌더링 제한 (G30) |
| 9 | ToolExecution.tsx render_widget case 추가 (G22) — 또는 현재 ChatPanel 직접 렌더링 유지 결정 |
| 10 | WidgetSkeleton/WidgetErrorFallback 컴포넌트 렌더링 테스트 추가 |
| 11 | render_widget 도구 통합 테스트 (DB 저장 + 결과 반환) |

### P3: Phase 3 고도화

| # | 작업 |
|---|------|
| 12 | widget:action 호스트 라우팅 연동 (navigate/filter/select/send-prompt) |
| 13 | widget:open-link 호스트 처리 |
| 14 | 위젯 캐시 — 대화 재진입 시 DB 조회 → 재렌더링 |
| 15 | SSEWidget description 필드 추가 |
| 16 | MutationObserver 테마 전환 테스트 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-18 | Initial — F48 Generative UI 갭 분석. 35항목: GREEN 19, YELLOW 4, RED 12. Overall 54%. Phase 1 ~85% 완성, Phase 2 0%, Phase 3 ~25% | Sinclair Seo |
