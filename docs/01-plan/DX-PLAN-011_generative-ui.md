---
code: DX-PLAN-011
title: "Generative UI — Agent 채팅 인터랙티브 시각화"
version: "0.1"
status: Draft
category: PLAN
created: 2026-03-18
updated: 2026-03-18
author: Sinclair Seo
---

# Generative UI — Agent 채팅 인터랙티브 시각화

> **Req**: DX-REQ-018 (F48, P2)
> **Target**: v0.8.0
> **Status**: Draft — 설계 단계

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | Agent 도구 결과 시각화가 `ToolExecution.tsx` switch문에 하드코딩 — 77개 도구 중 5개만 커스텀 뷰 제공. 나머지는 JSON 덤프. 새 시각화 추가 시마다 프론트엔드 배포 필요 |
| **Solution** | Generative UI: Agent가 런타임에 HTML/CSS/JS 시각화 코드를 생성 → sandboxed iframe 내에서 안전하게 렌더링. PostMessage 브릿지로 호스트와 양방향 통신 |
| **Function/UX Effect** | Agent가 "차트 그려줘"라고 하면 인터랙티브 차트가 메시지 안에 등장. 확대/축소, 호버 툴팁, 필터링 등 직접 조작 가능. 새 시각화 유형에 프론트엔드 배포 불필요 |
| **Core Value** | Agent 출력의 표현력 확장 — 텍스트+테이블 한계를 넘어 인터랙티브 시각화로 의사결정 지원 품질 도약 |

---

## 1. Overview

### 1.1 Purpose & Positioning

```
Agent Tool Result (JSON) → [render_widget 도구] → HTML/CSS/JS 생성
    → WidgetRenderer (sandboxed iframe) → 인터랙티브 시각화
```

Generative UI는 Agent가 도구 실행 결과를 **동적으로 시각화**하는 아키텍처이다.
현재 `ToolExecution.tsx`의 하드코딩 패턴을 보완하여, Agent가 질문 유형에 따라
적절한 시각화를 런타임에 생성한다.

### 1.2 Background

**현재 한계**:
- `ToolExecution.tsx`: `formatResult()` switch문으로 5개 도구만 커스텀 뷰 (`list_discoveries`, `get_discovery_detail`, `get_metrics`, `search_similar`, `generate_discovery_digest`)
- 나머지 72개 도구 결과는 `JSON.stringify(result, null, 2)` 로우 출력
- 새 시각화 추가 = React 컴포넌트 개발 + 프론트엔드 배포 필수

**해결 접근 (CopilotKit/OpenGenerativeUI 패턴)**:
1. Agent가 `render_widget` 도구로 HTML/CSS/JS 코드 생성
2. 클라이언트가 sandboxed iframe 내에서 안전하게 렌더링
3. PostMessage 브릿지로 iframe ↔ 호스트 양방향 통신
4. ResizeObserver로 iframe 높이 자동 조절

### 1.3 Related Documents

- [[DX-REQ-018]] F48: Generative UI
- [[DX-PLAN-005]] Integrated Execution Plan (v0.8.0 로드맵)
- `app/features/chat/ui/ToolExecution.tsx` — 현재 도구 결과 렌더링
- `app/features/chat/ui/ChatPanel.tsx` — SSE 스트리밍 + 메시지 렌더링
- `app/features/chat/ui/MessageBubble.tsx` — Agent 메시지 렌더링

---

## 2. Scope

### 2.1 In Scope

| # | 항목 | 설명 |
|---|------|------|
| S1 | **WidgetRenderer 컴포넌트** | sandboxed iframe + PostMessage 브릿지 + ResizeObserver 자동 사이징 |
| S2 | **render_widget Agent 도구** | HTML/CSS/JS 코드 생성 도구 스키마 + tool-handler 구현 |
| S3 | **위젯 유형 6종** | chart(bar/line/pie), diagram(flow/tree), table(interactive), metric-card, timeline, comparison |
| S4 | **PostMessage 프로토콜** | 호스트→iframe 데이터 전달, iframe→호스트 액션/리사이즈 이벤트 |
| S5 | **테마 동기화** | AX Design System CSS 변수를 iframe에 주입 (다크/라이트 모드) |
| S6 | **CSP 보안** | iframe sandbox 속성 + 허용 스크립트 제한 + origin 검증 |
| S7 | **ChatPanel 통합** | SSE `widget` 이벤트 타입 추가 + ToolExecution 분기 로직 |
| S8 | **위젯 캐시** | 동일 위젯 재렌더링 방지 (conversation별 위젯 ID 기반) |
| S9 | **에러 처리** | iframe 로드 실패, 렌더링 타임아웃, 악의적 코드 차단 |

### 2.2 Out of Scope

- 범용 UI 프레임워크 / 코드 에디터 (VS Code 수준)
- 사용자 정의 위젯 업로드/공유
- iframe 외부 직접 DOM 조작
- 서버사이드 위젯 렌더링 (SSR)
- 모바일 전용 위젯 레이아웃
- 위젯 내 Agent 재호출 (재귀 방지)

---

## 3. Architecture

### 3.1 전체 흐름

```
[사용자 질문]
    ↓
[Agent (SoulEngine)]
    ↓ tool_use: render_widget
    ├── widgetType: "chart"
    ├── title: "Discovery 상태 분포"
    ├── data: { labels: [...], values: [...] }
    └── code: "<div id='root'>...</div><script>...</script>"
    ↓
[SSE Event: type="widget"]
    ↓
[ChatPanel] → [WidgetRenderer]
    ↓
[Sandboxed iframe]
    ├── srcdoc: sanitized HTML
    ├── sandbox="allow-scripts"
    ├── PostMessage ↔ Host
    └── ResizeObserver → 자동 높이
```

### 3.2 WidgetRenderer 컴포넌트 설계

```typescript
// app/features/chat/ui/WidgetRenderer.tsx

interface WidgetRendererProps {
  widgetId: string;
  widgetType: WidgetType;
  title: string;
  code: string;              // Agent가 생성한 HTML/CSS/JS
  data: Record<string, unknown>;  // 위젯에 전달할 데이터
  maxHeight?: number;        // 기본 400px
}

type WidgetType =
  | "chart"        // bar, line, pie, radar
  | "diagram"      // flow, tree, mind-map
  | "table"        // sortable, filterable
  | "metric-card"  // KPI 카드 그리드
  | "timeline"     // 시간축 이벤트
  | "comparison";  // A/B 비교 뷰
```

**핵심 동작**:
1. `srcdoc`에 Agent 생성 HTML을 주입 (외부 URL 로드 불가)
2. `sandbox="allow-scripts"` — 스크립트 실행 허용, 나머지 차단
3. `window.addEventListener("message")` 로 iframe 이벤트 수신
4. ResizeObserver가 iframe 내부 `document.body` 높이 변화 감지 → 부모에 postMessage로 알림
5. 호스트가 iframe 높이를 동적 조절

### 3.3 PostMessage 프로토콜

```typescript
// Host → iframe (데이터 전달)
interface WidgetInitMessage {
  type: "widget:init";
  data: Record<string, unknown>;
  theme: ThemeVariables;     // CSS 변수 맵
}

// iframe → Host (액션/리사이즈)
interface WidgetResizeMessage {
  type: "widget:resize";
  height: number;
}

interface WidgetActionMessage {
  type: "widget:action";
  action: string;            // "navigate", "filter", "select" 등
  payload: Record<string, unknown>;
}

interface WidgetErrorMessage {
  type: "widget:error";
  message: string;
}
```

**Origin 검증**: 호스트는 `event.origin === "null"` (srcdoc iframe의 origin)만 수락.

### 3.4 Sandboxed iframe 보안 모델

| sandbox 속성 | 허용 | 차단 |
|-------------|------|------|
| `allow-scripts` | JavaScript 실행 | — |
| (미설정) `allow-same-origin` | — | 호스트 DOM/쿠키/localStorage 접근 |
| (미설정) `allow-forms` | — | 폼 제출 |
| (미설정) `allow-popups` | — | 새 창 열기 |
| (미설정) `allow-top-navigation` | — | 부모 페이지 이동 |

**추가 방어**:
- `srcdoc` 전용 — `src` 속성 사용 금지 (외부 URL 로드 차단)
- Agent 생성 코드에서 `<script src=...>` 외부 스크립트 태그 제거 (sanitize)
- iframe 내 `fetch`/`XMLHttpRequest` 차단 (CSP `connect-src 'none'`)
- 렌더링 타임아웃: 5초 내 `widget:resize` 미수신 시 에러 표시

### 3.5 테마 동기화

AX Design System의 CSS 변수를 iframe `<style>` 블록으로 주입:

```css
/* Host에서 추출 → iframe srcdoc에 주입 */
:root {
  --color-fg: ${getComputedStyle(document.documentElement).getPropertyValue('--color-fg')};
  --color-fg-secondary: ...;
  --color-bg: ...;
  --color-surface: ...;
  --color-surface-card: ...;
  --color-line: ...;
  --color-fg-brand: ...;
  --color-fg-error: ...;
  --color-fg-success: ...;
  /* ... 핵심 토큰 15~20개 */
}
```

다크/라이트 모드 전환 시 `widget:init` 메시지를 재전송하여 iframe 내부 업데이트.

### 3.6 iframe srcdoc 템플릿

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:;">
  <style>
    /* 테마 CSS 변수 주입 */
    ${themeStyles}
    /* 기본 리셋 */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: transparent; overflow: hidden; }
  </style>
</head>
<body>
  ${agentGeneratedHtml}
  <script>
    // ResizeObserver → 부모에 높이 알림
    const ro = new ResizeObserver(() => {
      parent.postMessage({
        type: 'widget:resize',
        height: document.body.scrollHeight
      }, '*');
    });
    ro.observe(document.body);

    // 호스트 데이터 수신
    window.addEventListener('message', (e) => {
      if (e.data?.type === 'widget:init') {
        window.__WIDGET_DATA__ = e.data.data;
        window.__WIDGET_THEME__ = e.data.theme;
        window.dispatchEvent(new CustomEvent('widget:data-ready'));
      }
    });

    // 초기 높이 보고
    parent.postMessage({
      type: 'widget:resize',
      height: document.body.scrollHeight
    }, '*');
  </script>
</body>
</html>
```

---

## 4. Implementation Plan

### Phase 1: WidgetRenderer 기본 (1~2일)

- [ ] **P1-1**: `WidgetRenderer` 컴포넌트 구현
  - sandboxed iframe + srcdoc 템플릿
  - PostMessage 리스너 (resize, action, error)
  - ResizeObserver 기반 자동 높이 조절
  - 로딩/에러/타임아웃 상태 UI
- [ ] **P1-2**: 위젯 헬퍼 유틸리티
  - `buildSrcdoc(code, theme)` — srcdoc HTML 조립
  - `extractThemeVars()` — 호스트 CSS 변수 추출
  - `sanitizeWidgetCode(html)` — 외부 스크립트/fetch 제거
- [ ] **P1-3**: ChatPanel 통합
  - SSE 이벤트 타입 `widget` 추가
  - `pendingToolCalls`에 위젯 데이터 포함
  - ToolExecution에서 `render_widget` 도구 결과 시 WidgetRenderer로 분기
- [ ] **P1-4**: 테스트
  - WidgetRenderer 단위 테스트 (렌더링, 리사이즈, 에러)
  - PostMessage 프로토콜 테스트
  - sanitizeWidgetCode 보안 테스트

### Phase 2: Agent Tool 연동 (2~3일)

- [ ] **P2-1**: `render_widget` 도구 스키마 정의
  - tool-schemas 디렉토리에 추가
  - 파라미터: `widgetType`, `title`, `code`, `data`, `description`
  - tool-registry 등록 (autonomy level 1 — read-only 시각화)
- [ ] **P2-2**: tool-handler 구현
  - Agent LLM에게 위젯 코드 생성 지시
  - 코드 사이즈 제한 (max 10KB)
  - 기본 위젯 템플릿 6종 제공 (Agent 프롬프트에 포함)
- [ ] **P2-3**: SoulEngine 프롬프트 업데이트
  - `render_widget` 도구 사용 가이드 추가
  - 위젯 유형별 코드 생성 예시
  - 자동 시각화 판단 기준 (Decision Matrix)
- [ ] **P2-4**: SSE 스트리밍 연동
  - `executor-stream.ts`에 `widget` 이벤트 타입 추가
  - 위젯 코드가 큰 경우 청크 분할 전송

### Phase 3: 테마/애니메이션/고도화 (1~2일)

- [ ] **P3-1**: AX Design System 테마 완전 동기화
  - 다크/라이트 모드 실시간 전환
  - `@axis-ds/tokens` CSS 변수 매핑 테이블
- [ ] **P3-2**: 위젯 애니메이션
  - 등장 애니메이션 (fade-in + scale)
  - 차트 데이터 업데이트 트랜지션
- [ ] **P3-3**: 위젯 액션 → 호스트 연동
  - iframe 내 클릭 → 호스트 라우팅 (Discovery 상세 이동 등)
  - 위젯 내 필터 → Agent 재질문 트리거
- [ ] **P3-4**: 위젯 캐시
  - conversation별 위젯 ID → srcdoc 캐시
  - 스크롤 복귀 시 재렌더링 방지

---

## 5. 대상 시각화 유형 — Decision Matrix

Agent가 질문 유형에 따라 자동으로 적절한 시각화를 선택하는 기준:

### 5.1 질문 유형 → 시각화 타입 매핑

| 질문 유형 | 대상 도구 | 위젯 타입 | 시각화 형태 | 예시 |
|-----------|-----------|-----------|------------|------|
| 분포/비율 | `get_metrics`, `get_kpi_status` | `chart` (pie/bar) | 원형/막대 차트 | "상태별 Discovery 분포" |
| 시간 추이 | `get_metrics`, `record_kpi_measurement` | `chart` (line) | 시계열 라인 차트 | "주간 Discovery 생성 추이" |
| 파이프라인 현황 | `get_pipeline_health` | `diagram` (flow) | 노드-엣지 플로우 | "11단계 파이프라인 병목" |
| 관계 구조 | `query_graph`, `get_linked_discoveries` | `diagram` (tree/mind-map) | 트리/마인드맵 | "온톨로지 엔티티 관계" |
| 목록 비교 | `list_discoveries`, `compare_discoveries` | `table` (interactive) | 정렬/필터 테이블 | "실험 결과 비교" |
| KPI 대시보드 | `get_kpi_status`, `get_pipeline_health` | `metric-card` | 카드 그리드 | "핵심 지표 4종 현황" |
| 이벤트 흐름 | `get_discovery_detail` | `timeline` | 수평 타임라인 | "Discovery 생애주기" |
| A/B 비교 | `compare_discoveries` | `comparison` | 좌우 분할 비교 | "두 Discovery 상세 비교" |

### 5.2 자동 시각화 판단 기준

Agent가 `render_widget` 호출 여부를 판단하는 기준:

```
1. 데이터 포인트 3개 이상 → 시각화 권장
2. 시간축 데이터 → line chart 자동 선택
3. 카테고리 비율 → pie/bar chart 자동 선택
4. 관계/연결 데이터 → diagram 자동 선택
5. 단일 수치 → metric-card
6. 비교 요청 → comparison 또는 interactive table
```

### 5.3 기본 위젯 템플릿

Agent 프롬프트에 포함할 6종 기본 템플릿 (Agent가 data만 바꿔서 사용):

| 템플릿 | 내장 라이브러리 | 인터랙션 |
|--------|---------------|----------|
| `chart-bar` | Canvas 2D API (외부 라이브러리 없음) | 호버 툴팁, 바 하이라이트 |
| `chart-line` | Canvas 2D API | 호버 크로스헤어, 데이터포인트 표시 |
| `chart-pie` | Canvas 2D API + CSS | 호버 섹터 확대, 레이블 표시 |
| `diagram-flow` | SVG 직접 생성 | 노드 클릭 → 상세 표시 |
| `table-interactive` | 순수 HTML/CSS/JS | 컬럼 정렬, 검색 필터 |
| `metric-card` | CSS Grid | 숫자 애니메이션 (countUp) |

> **원칙**: 외부 CDN 의존 없음. 순수 HTML/CSS/JS + Canvas/SVG만 사용.
> iframe CSP가 외부 스크립트를 차단하므로, 모든 코드는 인라인이어야 한다.

---

## 6. 기존 코드 영향 분석

### 6.1 수정 대상 파일

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `app/features/chat/ui/ChatPanel.tsx` | 수정 | SSE `widget` 이벤트 처리 + WidgetRenderer 렌더링 분기 |
| `app/features/chat/ui/ToolExecution.tsx` | 수정 | `render_widget` 도구 결과 시 WidgetRenderer 위임 |
| `app/features/chat/agent/tool-schemas/` | 신규 | `render-widget.ts` 도구 스키마 |
| `app/features/chat/agent/tool-registry.ts` | 수정 | `render_widget` 등록 (autonomy level 1) |
| `app/features/chat/agent/tool-handlers/` | 신규 | `render-widget-handler.ts` |
| `app/features/chat/agent/soul-engine.ts` | 수정 | 위젯 생성 가이드 시스템 프롬프트 추가 |
| `app/lib/ai/executor-stream.ts` | 수정 | `widget` SSE 이벤트 타입 추가 |

### 6.2 신규 파일

| 파일 | 역할 |
|------|------|
| `app/features/chat/ui/WidgetRenderer.tsx` | sandboxed iframe 위젯 렌더러 |
| `app/features/chat/ui/widget-templates/` | 6종 기본 위젯 HTML 템플릿 |
| `app/features/chat/lib/widget-sanitizer.ts` | 위젯 코드 새니타이징 유틸 |
| `app/features/chat/lib/widget-theme.ts` | CSS 변수 추출 + 테마 주입 |
| `app/features/chat/lib/widget-protocol.ts` | PostMessage 타입 + 핸들러 |

### 6.3 ChatPanel 통합 상세

현재 `ChatPanel.tsx`의 SSE 이벤트 루프에 `widget` 타입 추가:

```typescript
// 현재: text_delta, tool_start, tool_call, budget_warning, error
// 추가: widget

} else if (event.type === "widget") {
  // WidgetRenderer에 전달할 데이터 축적
  setPendingWidgets((prev) => [
    ...prev,
    {
      widgetId: event.widgetId,
      widgetType: event.widgetType,
      title: event.title,
      code: event.code,
      data: event.data,
    },
  ]);
}
```

`ToolExecution.tsx`의 `formatResult()` 분기:

```typescript
// render_widget 도구 결과 → WidgetRenderer로 위임
case "render_widget":
  return (
    <WidgetRenderer
      widgetId={result.widgetId as string}
      widgetType={result.widgetType as WidgetType}
      title={result.title as string}
      code={result.code as string}
      data={result.data as Record<string, unknown>}
    />
  );
```

### 6.4 기존 시각화와의 공존

- 기존 `ToolExecution`의 5개 커스텀 뷰 (`DiscoveriesTable`, `DetailCard`, `MetricsView`, `SearchResults`, `DigestView`)는 유지
- Agent가 `render_widget`을 호출한 경우에만 WidgetRenderer 사용
- 점진적 마이그레이션: 기존 커스텀 뷰를 위젯 템플릿으로 전환 가능 (Phase 3 이후)

---

## 7. Risk & Mitigation

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| R1 | **XSS / 악의적 코드 실행** | Critical | Low | iframe `sandbox="allow-scripts"` (allow-same-origin 제외), CSP `connect-src 'none'`, srcdoc 전용 (외부 URL 차단), sanitizer로 `<script src>` 제거 |
| R2 | **Agent 생성 코드 품질 불안정** | High | Medium | 6종 기본 템플릿 제공 (Agent가 data만 교체), 코드 사이즈 제한 (10KB), 렌더링 타임아웃 5초, JSON fallback |
| R3 | **iframe 렌더링 성능** | Medium | Medium | iframe 1개당 별도 브라우저 컨텍스트 — 대화당 최대 5개 위젯 제한, 스크롤 밖 위젯 lazy 로드, 위젯 캐시 |
| R4 | **LLM 토큰 비용 증가** | Medium | High | 위젯 코드 생성에 추가 토큰 소모 — 템플릿 기반으로 최소화 (data 교체 방식), 비용 모니터링 |
| R5 | **다크/라이트 모드 불일치** | Low | Medium | 테마 CSS 변수 주입 + 모드 전환 시 `widget:init` 재전송 |
| R6 | **모바일 반응형 미지원** | Low | Low | Out of Scope 명시, Phase 4에서 viewport 감지 추가 가능 |
| R7 | **외부 라이브러리 의존** | Medium | Low | 순수 Canvas/SVG/CSS만 사용 원칙. CDN 의존 차단 (CSP). 필요 시 인라인 미니 라이브러리 |

### 보안 심층 방어 (Defense in Depth)

```
Layer 1: Agent 프롬프트 — "외부 URL, fetch, XMLHttpRequest 사용 금지" 지시
Layer 2: sanitizer — <script src>, <link href>, <iframe> 태그 제거
Layer 3: CSP — connect-src 'none', frame-src 'none', img-src data: blob:
Layer 4: sandbox — allow-scripts만 허용 (same-origin, forms, popups, navigation 차단)
Layer 5: PostMessage origin 검증 — "null" (srcdoc)만 수락
Layer 6: 렌더링 타임아웃 — 5초 내 미응답 시 iframe 제거 + 에러 표시
```

---

## 8. Dependencies & Prerequisites

| 항목 | 상태 | 비고 |
|------|------|------|
| React 19 + sandboxed iframe | 사용 가능 | `srcdoc` + `sandbox` 브라우저 호환성 충분 |
| PostMessage API | 사용 가능 | 모든 모던 브라우저 지원 |
| ResizeObserver | 사용 가능 | Safari 13.1+, Chrome 64+ |
| Canvas 2D API | 사용 가능 | 차트 렌더링용 |
| Agent 도구 추가 체계 | 완비 | tool-schemas/ + tool-registry + tool-handlers 패턴 확립 |
| AI API 크레딧 | 필요 | 위젯 코드 생성에 추가 토큰 소모 (Anthropic 또는 fallback) |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-18 | Initial — F48 Generative UI Plan 초안. Architecture, Implementation 3-Phase, Decision Matrix, 영향 분석, 보안 모델 | Sinclair Seo |
