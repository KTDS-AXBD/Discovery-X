---
code: DX-DSGN-018
title: "Generative UI — Agent 채팅 인터랙티브 시각화 설계"
version: "0.1"
status: Draft
category: DSGN
created: 2026-03-18
updated: 2026-03-18
author: Sinclair Seo
---

# Generative UI — Agent 채팅 인터랙티브 시각화 설계

> **Plan**: [[DX-PLAN-011]]
> **Req**: DX-REQ-018 (F48, P2)
> **Target**: v0.8.0
> **Status**: Draft — 설계 단계

---

## 1. 컴포넌트 아키텍처

### 1.1 라우트 구조 — 변경 없음

Generative UI는 **기존 chat 라우트 내 확장**이다. 새로운 라우트를 추가하지 않는다.

```
app/routes/
├── chat.tsx                 — 기존 레이아웃 (변경 없음)
├── chat._index.tsx          — 대화 목록 (변경 없음)
└── chat.$id.tsx             — 대화 상세 (ChatPanel 사용, 변경 없음)

app/features/chat/ui/
├── ChatPanel.tsx            — [수정] SSE widget 이벤트 처리 + WidgetRenderer 분기
├── ToolExecution.tsx         — [수정] render_widget 도구 결과 시 WidgetRenderer 위임
├── MessageBubble.tsx         — (변경 없음)
├── WidgetRenderer.tsx        — [신규] sandboxed iframe 위젯 렌더러
├── WidgetSkeleton.tsx        — [신규] 위젯 로딩 스켈레톤
└── WidgetErrorFallback.tsx   — [신규] 위젯 에러 폴백 UI
```

### 1.2 WidgetRenderer 컴포넌트 계층도

```
ChatPanel.tsx
├── MessageBubble              — 기존 텍스트/마크다운 메시지
├── ToolExecution              — 기존 도구 실행 결과
│   └── [render_widget 도구]   — WidgetRenderer로 위임
│       └── WidgetRenderer     ← 핵심 신규 컴포넌트
│           ├── WidgetSkeleton     — 로딩 상태 (shimmer + 타이틀)
│           ├── <iframe>           — sandbox="allow-scripts", srcdoc 기반
│           │   ├── 테마 CSS 변수 (host에서 주입)
│           │   ├── Agent 생성 HTML/CSS/JS
│           │   └── PostMessage 브릿지 (resize, action, error)
│           └── WidgetErrorFallback — 타임아웃/렌더링 실패 시 JSON fallback
└── SuggestionChip             — 기존 제안 칩
```

### 1.3 feature 모듈 확장

```
app/features/chat/
├── agent/
│   ├── executor-stream.ts       — [수정] widget SSE 이벤트 전송
│   ├── tool-registry.ts         — [수정] render_widget 등록
│   ├── tool-schemas/
│   │   ├── index.ts             — [수정] WIDGET_TOOLS export 추가
│   │   └── widget-schemas.ts    — [신규] render_widget 도구 스키마
│   └── system-prompt.ts         — [수정] 위젯 생성 가이드 추가
├── db/
│   └── schema.ts                — [수정] chat_widgets 테이블 추가
├── lib/
│   ├── widget-sanitizer.ts      — [신규] 위젯 코드 새니타이징
│   ├── widget-theme.ts          — [신규] CSS 변수 추출 + 주입
│   └── widget-protocol.ts       — [신규] PostMessage 타입 + 핸들러
└── ui/
    ├── WidgetRenderer.tsx       — [신규]
    ├── WidgetSkeleton.tsx       — [신규]
    └── WidgetErrorFallback.tsx  — [신규]
```

---

## 2. UI 컴포넌트 설계

### 2.1 WidgetRenderer.tsx

Agent가 생성한 HTML/CSS/JS를 sandboxed iframe 내에서 안전하게 렌더링하는 핵심 컴포넌트.

```typescript
// app/features/chat/ui/WidgetRenderer.tsx

import { useRef, useEffect, useState, useCallback } from "react";
import { WidgetSkeleton } from "./WidgetSkeleton";
import { WidgetErrorFallback } from "./WidgetErrorFallback";
import { buildSrcdoc } from "~/features/chat/lib/widget-theme";
import { sanitizeWidgetCode } from "~/features/chat/lib/widget-sanitizer";
import type { WidgetType, WidgetMessage } from "~/features/chat/lib/widget-protocol";

interface WidgetRendererProps {
  widgetId: string;
  widgetType: WidgetType;
  title: string;
  code: string;                        // Agent가 생성한 HTML/CSS/JS
  data: Record<string, unknown>;       // 위젯에 전달할 데이터
  maxHeight?: number;                  // 기본 400px
}

type WidgetState = "loading" | "ready" | "error" | "timeout";

const RENDER_TIMEOUT_MS = 5_000;
const MAX_WIDGET_HEIGHT = 600;
const DEFAULT_MAX_HEIGHT = 400;

export function WidgetRenderer({
  widgetId,
  widgetType,
  title,
  code,
  data,
  maxHeight = DEFAULT_MAX_HEIGHT,
}: WidgetRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<WidgetState>("loading");
  const [height, setHeight] = useState(200);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // 1. PostMessage 리스너
  const handleMessage = useCallback(
    (event: MessageEvent<WidgetMessage>) => {
      // Origin 검증: srcdoc iframe은 origin이 "null"
      if (event.origin !== "null") return;
      // iframe source 검증
      if (event.source !== iframeRef.current?.contentWindow) return;

      const msg = event.data;
      if (!msg?.type?.startsWith("widget:")) return;

      switch (msg.type) {
        case "widget:resize":
          setState("ready");
          clearTimeout(timeoutRef.current);
          setHeight(Math.min(msg.height, Math.min(maxHeight, MAX_WIDGET_HEIGHT)));
          break;
        case "widget:action":
          // Phase 3에서 호스트 라우팅/Agent 재질문 연동
          console.log("[Widget Action]", msg.action, msg.payload);
          break;
        case "widget:error":
          setState("error");
          setErrorMessage(msg.message);
          break;
      }
    },
    [maxHeight],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  // 2. 렌더링 타임아웃
  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      if (state === "loading") {
        setState("timeout");
        setErrorMessage("위젯 렌더링 타임아웃 (5초)");
      }
    }, RENDER_TIMEOUT_MS);
    return () => clearTimeout(timeoutRef.current);
  }, [state]);

  // 3. iframe 로드 후 데이터 전달
  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    iframe.contentWindow.postMessage(
      {
        type: "widget:init",
        data,
        theme: extractThemeVarsFromDOM(),
      },
      "*", // srcdoc iframe에는 targetOrigin "*" 필수
    );
  }, [data]);

  // 4. srcdoc 조립
  const sanitizedCode = sanitizeWidgetCode(code);
  const srcdoc = buildSrcdoc(sanitizedCode);

  // 5. 상태별 렌더링
  return (
    <div className="my-2 rounded-xl border border-line bg-surface-card overflow-hidden">
      {/* 위젯 헤더 */}
      <div className="flex items-center gap-2 border-b border-line-subtle-alt px-3 py-2">
        <WidgetTypeIcon type={widgetType} />
        <span className="text-xs font-medium text-fg">{title}</span>
        <span className="ml-auto text-[10px] text-fg-tertiary">{widgetType}</span>
      </div>

      {/* 위젯 본문 */}
      <div className="relative">
        {state === "loading" && <WidgetSkeleton title={title} />}

        {(state === "error" || state === "timeout") && (
          <WidgetErrorFallback
            message={errorMessage}
            data={data}
          />
        )}

        <iframe
          ref={iframeRef}
          srcDoc={srcdoc}
          sandbox="allow-scripts"
          onLoad={handleIframeLoad}
          title={`Widget: ${title}`}
          className="w-full border-0 transition-[height] duration-200"
          style={{
            height: state === "ready" ? `${height}px` : "0px",
            opacity: state === "ready" ? 1 : 0,
          }}
        />
      </div>
    </div>
  );
}

/** DOM에서 현재 테마 CSS 변수 추출 */
function extractThemeVarsFromDOM(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const cs = getComputedStyle(document.documentElement);
  const vars = [
    "--color-fg", "--color-fg-secondary", "--color-fg-tertiary",
    "--color-fg-brand", "--color-fg-error", "--color-fg-success",
    "--color-bg", "--color-surface", "--color-surface-card",
    "--color-surface-secondary", "--color-line", "--color-line-subtle",
  ];
  const result: Record<string, string> = {};
  for (const v of vars) {
    result[v] = cs.getPropertyValue(v).trim();
  }
  return result;
}

/** 위젯 타입별 아이콘 */
function WidgetTypeIcon({ type }: { type: WidgetType }) {
  const icons: Record<WidgetType, string> = {
    chart: "📊",
    diagram: "🔀",
    table: "📋",
    "metric-card": "📈",
    timeline: "⏳",
    comparison: "⚖️",
  };
  return <span className="text-sm">{icons[type] || "📊"}</span>;
}
```

### 2.2 WidgetSkeleton.tsx

```typescript
// app/features/chat/ui/WidgetSkeleton.tsx

interface WidgetSkeletonProps {
  title: string;
}

export function WidgetSkeleton({ title }: WidgetSkeletonProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-8" role="status" aria-label="위젯 로딩 중">
      {/* Shimmer bars */}
      <div className="w-full space-y-2">
        <div className="h-3 w-3/4 animate-pulse rounded bg-surface-secondary" />
        <div className="h-24 w-full animate-pulse rounded bg-surface-secondary" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-surface-secondary" />
      </div>
      <span className="text-xs text-fg-tertiary">
        {title} 렌더링 중...
      </span>
    </div>
  );
}
```

### 2.3 WidgetErrorFallback.tsx

```typescript
// app/features/chat/ui/WidgetErrorFallback.tsx

interface WidgetErrorFallbackProps {
  message: string | null;
  data: Record<string, unknown>;
}

export function WidgetErrorFallback({ message, data }: WidgetErrorFallbackProps) {
  return (
    <div className="p-4">
      <div className="mb-2 flex items-center gap-2 text-xs text-fg-error">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <span>{message || "위젯 렌더링에 실패했습니다"}</span>
      </div>
      {/* JSON fallback */}
      <pre className="max-h-48 overflow-auto rounded-lg bg-surface-secondary p-3 text-[11px] leading-relaxed text-fg-secondary">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
```

---

## 3. PostMessage 프로토콜 정의

### 3.1 메시지 타입 총괄

```typescript
// app/features/chat/lib/widget-protocol.ts

// ─── 위젯 타입 ────────────────────────────────────────────────
export type WidgetType =
  | "chart"         // bar, line, pie, radar
  | "diagram"       // flow, tree, mind-map
  | "table"         // sortable, filterable
  | "metric-card"   // KPI 카드 그리드
  | "timeline"      // 시간축 이벤트
  | "comparison";   // A/B 비교 뷰

// ─── Host → iframe 메시지 ─────────────────────────────────────
/** 초기 데이터 + 테마 전달 */
export interface WidgetInitMessage {
  type: "widget:init";
  data: Record<string, unknown>;
  theme: Record<string, string>;      // CSS 변수 맵 (key: "--color-fg", value: "#fff")
}

/** 테마 변경 (다크/라이트 전환 시) */
export interface WidgetThemeChangeMessage {
  type: "widget:theme-change";
  theme: Record<string, string>;
}

// ─── iframe → Host 메시지 ─────────────────────────────────────
/** iframe 높이 변경 알림 */
export interface WidgetResizeMessage {
  type: "widget:resize";
  height: number;
}

/** iframe 내부 사용자 액션 */
export interface WidgetActionMessage {
  type: "widget:action";
  action: "navigate" | "filter" | "select" | "send-prompt";
  payload: Record<string, unknown>;
  // action별 payload:
  //   navigate:    { discoveryId: string }
  //   filter:      { field: string, value: string }
  //   select:      { itemId: string, data: unknown }
  //   send-prompt: { message: string }
}

/** iframe 내부 에러 */
export interface WidgetErrorMessage {
  type: "widget:error";
  message: string;
}

/** iframe 외부 링크 열기 요청 */
export interface WidgetOpenLinkMessage {
  type: "widget:open-link";
  url: string;
}

// ─── 유니언 타입 ──────────────────────────────────────────────
export type HostToIframeMessage = WidgetInitMessage | WidgetThemeChangeMessage;
export type IframeToHostMessage =
  | WidgetResizeMessage
  | WidgetActionMessage
  | WidgetErrorMessage
  | WidgetOpenLinkMessage;
export type WidgetMessage = HostToIframeMessage | IframeToHostMessage;
```

### 3.2 프로토콜 시퀀스

```
┌──────────┐                    ┌──────────────┐
│   Host   │                    │  iframe      │
│(ChatPanel)│                    │ (srcdoc)     │
└────┬─────┘                    └──────┬───────┘
     │                                  │
     │  1. iframe onLoad                │
     │──── widget:init ────────────────>│  데이터 + 테마 수신
     │     { data, theme }              │
     │                                  │  2. 렌더링 시작
     │                                  │
     │<──── widget:resize ─────────────│  3. 높이 보고 (ResizeObserver)
     │      { height: 320 }             │
     │                                  │
     │  4. Host가 iframe height 조절    │
     │                                  │
     │<──── widget:action ─────────────│  5. 사용자 인터랙션 (옵션)
     │      { action, payload }         │
     │                                  │
     │  6. 다크/라이트 모드 전환 시      │
     │──── widget:theme-change ────────>│  테마 업데이트
     │     { theme }                    │
     │                                  │
     │<──── widget:error ──────────────│  7. 에러 발생 시 (옵션)
     │      { message }                 │
     └──────────────────────────────────┘
```

### 3.3 Origin 검증 규칙

| 방향 | 검증 대상 | 허용 조건 |
|------|----------|----------|
| iframe → Host | `event.origin` | `"null"` (srcdoc iframe 고유 origin) |
| iframe → Host | `event.source` | `iframeRef.current?.contentWindow` 일치 |
| Host → iframe | `targetOrigin` | `"*"` (srcdoc은 `"null"` origin이므로 지정 불가, sandbox가 방어) |
| iframe → Host | `event.data.type` | `"widget:"` 접두사 필수 |

---

## 4. iframe 보안 설계

### 4.1 sandbox 속성

```html
<iframe sandbox="allow-scripts" />
```

| sandbox 속성 | 상태 | 효과 |
|-------------|------|------|
| `allow-scripts` | **허용** | JavaScript 실행 가능 (Canvas, SVG 동적 생성 필수) |
| `allow-same-origin` | **차단** | 호스트 DOM, 쿠키, localStorage, sessionStorage 접근 불가 |
| `allow-forms` | **차단** | `<form>` 제출 불가 |
| `allow-popups` | **차단** | `window.open()`, `target="_blank"` 불가 |
| `allow-top-navigation` | **차단** | `parent.location` 변경 불가 |
| `allow-modals` | **차단** | `alert()`, `confirm()`, `prompt()` 불가 |

### 4.2 Content Security Policy (CSP)

iframe `srcdoc` 내부 `<meta>` 태그로 CSP 적용:

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'none';
  script-src 'unsafe-inline';
  style-src 'unsafe-inline';
  img-src data: blob:;
  font-src data:;
  connect-src 'none';
  frame-src 'none';
  object-src 'none';
  base-uri 'none';
">
```

| CSP 지시어 | 정책 | 차단 대상 |
|-----------|------|----------|
| `default-src 'none'` | 모든 리소스 기본 차단 | 외부 URL 전체 |
| `script-src 'unsafe-inline'` | 인라인 스크립트만 허용 | `<script src="...">` 외부 스크립트 |
| `style-src 'unsafe-inline'` | 인라인 스타일만 허용 | `<link rel="stylesheet">` 외부 CSS |
| `connect-src 'none'` | 네트워크 요청 전면 차단 | `fetch()`, `XMLHttpRequest`, `WebSocket` |
| `img-src data: blob:` | data URI, blob URI만 허용 | 외부 이미지 URL |
| `frame-src 'none'` | 중첩 iframe 차단 | iframe-in-iframe 공격 |

### 4.3 심층 방어 (Defense in Depth) — 6계층

```
Layer 1: Agent 시스템 프롬프트
  └─ "외부 URL, fetch, XMLHttpRequest 사용 금지" 지시
     "모든 코드는 인라인이어야 함"

Layer 2: widget-sanitizer.ts (서버/클라이언트)
  └─ <script src=...>, <link href=...>, <iframe> 태그 제거
     fetch/XMLHttpRequest/WebSocket 호출 코드 경고
     코드 사이즈 제한 (10KB)

Layer 3: CSP <meta> 태그
  └─ connect-src 'none' → 네트워크 요청 전면 차단
     frame-src 'none' → 중첩 iframe 차단

Layer 4: iframe sandbox
  └─ allow-scripts만 허용
     same-origin, forms, popups, navigation 전부 차단

Layer 5: PostMessage origin 검증
  └─ event.origin === "null" (srcdoc) + event.source 일치 확인
     "widget:" 접두사 타입만 수용

Layer 6: 렌더링 타임아웃 + 위젯 제한
  └─ 5초 내 widget:resize 미수신 → iframe 제거 + 에러 표시
     대화당 최대 5개 위젯 동시 렌더링
     위젯 코드 10KB 제한
```

### 4.4 widget-sanitizer.ts

```typescript
// app/features/chat/lib/widget-sanitizer.ts

const MAX_CODE_SIZE = 10_240; // 10KB

/** 위험한 패턴 목록 */
const DANGEROUS_PATTERNS = [
  /<script\s+[^>]*src\s*=/gi,              // 외부 스크립트
  /<link\s+[^>]*href\s*=/gi,               // 외부 CSS
  /<iframe/gi,                              // 중첩 iframe
  /<object/gi,                              // Object 임베드
  /<embed/gi,                               // Embed 태그
  /document\.cookie/gi,                     // 쿠키 접근 시도
  /localStorage|sessionStorage/gi,          // 스토리지 접근 시도
  /window\.open\s*\(/gi,                    // 팝업 시도
  /top\.location|parent\.location/gi,       // 네비게이션 시도
];

export interface SanitizeResult {
  code: string;
  warnings: string[];
  blocked: boolean;
}

export function sanitizeWidgetCode(rawCode: string): string {
  const result = sanitizeWidgetCodeDetailed(rawCode);
  if (result.blocked) {
    throw new Error(`위젯 코드가 보안 정책을 위반합니다: ${result.warnings.join(", ")}`);
  }
  return result.code;
}

export function sanitizeWidgetCodeDetailed(rawCode: string): SanitizeResult {
  const warnings: string[] = [];

  // 1. 사이즈 체크
  if (rawCode.length > MAX_CODE_SIZE) {
    return { code: "", warnings: [`코드 사이즈 초과 (${rawCode.length} > ${MAX_CODE_SIZE})`], blocked: true };
  }

  let code = rawCode;

  // 2. 위험 패턴 제거
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      warnings.push(`차단된 패턴: ${pattern.source}`);
      code = code.replace(pattern, "<!-- blocked -->");
    }
  }

  // 3. 외부 fetch/XHR 경고 (CSP가 차단하므로 제거까지는 안 함)
  if (/\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket/g.test(code)) {
    warnings.push("네트워크 요청 코드 감지 — CSP에 의해 차단됨");
  }

  return { code, warnings, blocked: false };
}
```

---

## 5. CSS 변수 테마 시스템

### 5.1 AX Design System 토큰 매핑

Host 페이지의 CSS 변수를 iframe `<style>` 블록으로 주입한다. `@axis-ds/tokens`에서 사용하는 변수 15개를 선별:

```typescript
// app/features/chat/lib/widget-theme.ts

/** iframe에 주입할 핵심 CSS 변수 목록 */
export const THEME_VARS = [
  // 텍스트
  "--color-fg",
  "--color-fg-secondary",
  "--color-fg-tertiary",
  "--color-fg-brand",
  "--color-fg-error",
  "--color-fg-success",
  "--color-fg-warning",
  // 배경
  "--color-bg",
  "--color-surface",
  "--color-surface-card",
  "--color-surface-secondary",
  // 라인
  "--color-line",
  "--color-line-subtle",
  "--color-line-brand",
  // 기타
  "--color-btn-bg",
] as const;

/** 테마 변수 맵을 CSS :root 블록 문자열로 변환 */
export function buildThemeStyleBlock(theme: Record<string, string>): string {
  const vars = Object.entries(theme)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n");
  return `:root {\n${vars}\n}`;
}

/** 완전한 srcdoc HTML 조립 */
export function buildSrcdoc(agentCode: string, themeOverride?: Record<string, string>): string {
  // 서버사이드에서는 기본 테마 사용, 클라이언트에서는 DOM에서 추출
  const themeBlock = themeOverride
    ? buildThemeStyleBlock(themeOverride)
    : "/* 테마는 widget:init 메시지로 동적 주입 */";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none';">
  <style>
    ${themeBlock}
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: transparent;
      overflow: hidden;
      color: var(--color-fg, #1a1a2e);
      font-size: 13px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  ${agentCode}
  <script>
    // ─── ResizeObserver → 부모에 높이 알림 ───────────────────
    const _ro = new ResizeObserver(() => {
      parent.postMessage({
        type: 'widget:resize',
        height: document.body.scrollHeight
      }, '*');
    });
    _ro.observe(document.body);

    // ─── 호스트 메시지 수신 ──────────────────────────────────
    window.addEventListener('message', (e) => {
      if (e.data?.type === 'widget:init') {
        window.__WIDGET_DATA__ = e.data.data;
        window.__WIDGET_THEME__ = e.data.theme;
        // 테마 CSS 변수 동적 적용
        if (e.data.theme) {
          const root = document.documentElement;
          Object.entries(e.data.theme).forEach(([k, v]) => root.style.setProperty(k, v));
        }
        window.dispatchEvent(new CustomEvent('widget:data-ready'));
      } else if (e.data?.type === 'widget:theme-change') {
        if (e.data.theme) {
          const root = document.documentElement;
          Object.entries(e.data.theme).forEach(([k, v]) => root.style.setProperty(k, v));
        }
      }
    });

    // ─── 에러 핸들러 ─────────────────────────────────────────
    window.onerror = (msg) => {
      parent.postMessage({ type: 'widget:error', message: String(msg) }, '*');
    };

    // ─── 초기 높이 보고 ──────────────────────────────────────
    parent.postMessage({
      type: 'widget:resize',
      height: document.body.scrollHeight
    }, '*');
  </script>
</body>
</html>`;
}
```

### 5.2 다크/라이트 모드 전환

Host 페이지에서 테마가 변경되면 `WidgetRenderer`가 `widget:theme-change` 메시지를 iframe에 전송한다:

```typescript
// WidgetRenderer 내부 — MutationObserver로 테마 변경 감지
useEffect(() => {
  const observer = new MutationObserver(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || state !== "ready") return;
    iframe.contentWindow.postMessage(
      { type: "widget:theme-change", theme: extractThemeVarsFromDOM() },
      "*",
    );
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme"],
  });
  return () => observer.disconnect();
}, [state]);
```

---

## 6. Agent 도구 스키마 — render_widget

### 6.1 도구 정의 (ClaudeTool)

```typescript
// app/features/chat/agent/tool-schemas/widget-schemas.ts

import type { ClaudeTool } from "~/lib/ai";

export const WIDGET_TOOLS: ClaudeTool[] = [
  {
    name: "render_widget",
    description: `인터랙티브 시각화 위젯을 생성합니다. 데이터를 차트, 다이어그램, 테이블 등으로 시각화할 때 사용하세요.

규칙:
- 모든 코드는 인라인 HTML/CSS/JS로 작성 (외부 URL/CDN 금지)
- 차트는 Canvas 2D API, 다이어그램은 SVG 직접 생성
- CSS 변수(--color-fg, --color-fg-brand 등)로 테마 호환
- window.__WIDGET_DATA__로 데이터 접근 (widget:data-ready 이벤트 대기)
- 최대 코드 크기: 10KB`,
    input_schema: {
      type: "object",
      required: ["widgetType", "title", "code", "data"],
      properties: {
        widgetType: {
          type: "string",
          enum: ["chart", "diagram", "table", "metric-card", "timeline", "comparison"],
          description: "위젯 유형",
        },
        title: {
          type: "string",
          description: "위젯 제목 (예: 'Discovery 상태 분포')",
        },
        code: {
          type: "string",
          description: "HTML/CSS/JS 인라인 코드. <div id='root'>...</div><style>...</style><script>...</script> 구조. window.__WIDGET_DATA__로 데이터 접근.",
        },
        data: {
          type: "object",
          description: "위젯에 전달할 구조화 데이터 (JSON). code 내에서 window.__WIDGET_DATA__로 접근.",
        },
        description: {
          type: "string",
          description: "위젯 설명 (접근성 + 로깅용, 선택)",
        },
      },
    },
  },
];
```

### 6.2 tool-schemas/index.ts 수정

```typescript
// 기존 11개 export에 추가:
export { WIDGET_TOOLS } from "./widget-schemas";
```

### 6.3 tool-registry.ts 수정

```typescript
import { WIDGET_TOOLS } from "./tool-schemas";

// getToolsForAutonomyLevel() 내부:
// autonomy level 1 (ADVISORY) 이상에서 render_widget 사용 가능
// → 읽기 전용 시각화이므로 ADVISORY 수준
if (level >= AgentAutonomyLevel.ADVISORY) {
  tools.push(...WIDGET_TOOLS);
}
```

### 6.4 도구 실행 흐름

`render_widget`은 일반 도구와 달리 **DB 조작 없이 클라이언트에 코드를 전달**하는 패스스루 도구이다:

```
Agent → tool_use: render_widget { widgetType, title, code, data }
  ↓
executor-stream.ts: processToolBlocks()
  ↓ tool-handler에서 render_widget을 인식
  ↓ sanitizeWidgetCode(code) 검증
  ↓ tool_result: { widgetId, widgetType, title, code, data } (패스스루)
  ↓
SSE → tool_call 이벤트로 클라이언트 전송
  ↓
ChatPanel → ToolExecution → WidgetRenderer 분기
```

### 6.5 tool-handler 구현 — agent-pipeline.ts 내

```typescript
// agent-pipeline.ts processToolBlocks() 내부 분기 추가:

case "render_widget": {
  const { widgetType, title, code, data, description } = toolInput;
  const sanitizeResult = sanitizeWidgetCodeDetailed(code as string);

  if (sanitizeResult.blocked) {
    return JSON.stringify({
      error: "위젯 코드가 보안 정책을 위반합니다",
      warnings: sanitizeResult.warnings,
    });
  }

  const widgetId = crypto.randomUUID();

  // DB 저장 (위젯 캐시용)
  await db.insert(chatWidgets).values({
    id: widgetId,
    conversationId,
    widgetType: widgetType as string,
    title: title as string,
    code: sanitizeResult.code,
    data: data as Record<string, unknown>,
    description: (description as string) || null,
  });

  return JSON.stringify({
    widgetId,
    widgetType,
    title,
    code: sanitizeResult.code,
    data,
    warnings: sanitizeResult.warnings,
  });
}
```

---

## 7. SSE 이벤트 확장

### 7.1 현재 SSE 이벤트 타입

| # | 이벤트 타입 | 방향 | 용도 |
|---|-----------|------|------|
| 1 | `text_delta` | server → client | Assistant 텍스트 스트리밍 |
| 2 | `tool_start` | server → client | 도구 실행 시작 알림 |
| 3 | `tool_call` | server → client | 도구 실행 완료 + 결과 |
| 4 | `budget_warning` | server → client | 토큰 예산 경고 |
| 5 | `error` | server → client | 에러 메시지 |

### 7.2 변경 사항 — 신규 이벤트 없음

`render_widget`은 기존 `tool_call` 이벤트 안에 결과를 포함하므로, **새로운 SSE 이벤트 타입을 추가하지 않는다**:

```typescript
// executor-stream.ts sendToolResults() — 기존 코드 그대로 동작
send(controller, {
  type: "tool_call",
  name: "render_widget",       // 도구 이름으로 클라이언트가 분기
  input: { widgetType, title },
  result: { widgetId, widgetType, title, code, data },
});
```

**이유**: 별도 `widget` 이벤트를 만들면 SSE 파싱 로직, 에러 처리, 재시도 로직을 모두 이중화해야 한다. `tool_call` 이벤트 안에서 `name === "render_widget"`을 판별하는 것이 가장 단순하다.

### 7.3 ChatPanel.tsx 변경

기존 `tool_call` 이벤트 처리에서 `render_widget`은 자연스럽게 `pendingToolCalls`에 포함된다. `ToolExecution` 컴포넌트에서 분기:

```typescript
// ToolExecution.tsx formatResult() 수정:
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

---

## 8. 타입 정의

### 8.1 WidgetType enum

```typescript
// app/features/chat/lib/widget-protocol.ts (§3에서 정의)

export type WidgetType =
  | "chart"         // bar, line, pie, radar — Canvas 2D API
  | "diagram"       // flow, tree, mind-map — SVG 직접 생성
  | "table"         // sortable, filterable — 순수 HTML/CSS/JS
  | "metric-card"   // KPI 카드 그리드 — CSS Grid
  | "timeline"      // 시간축 이벤트 — SVG/CSS
  | "comparison";   // A/B 비교 뷰 — CSS Grid
```

### 8.2 WidgetRenderProps 인터페이스

```typescript
/** WidgetRenderer에 전달되는 props */
export interface WidgetRenderProps {
  widgetId: string;
  widgetType: WidgetType;
  title: string;
  code: string;
  data: Record<string, unknown>;
  maxHeight?: number;
}
```

### 8.3 WidgetMessage 유니언 타입

§3에서 정의한 `WidgetMessage` 타입 재정리:

```typescript
/** 모든 PostMessage 메시지의 유니언 */
export type WidgetMessage =
  // Host → iframe
  | WidgetInitMessage
  | WidgetThemeChangeMessage
  // iframe → Host
  | WidgetResizeMessage
  | WidgetActionMessage
  | WidgetErrorMessage
  | WidgetOpenLinkMessage;
```

### 8.4 DB 레코드 타입

```typescript
/** chat_widgets 테이블 레코드 */
export interface ChatWidget {
  id: string;                          // UUID
  conversationId: string;              // FK → conversations.id
  widgetType: WidgetType;
  title: string;
  code: string;                        // sanitized HTML/CSS/JS
  data: Record<string, unknown>;       // JSON
  description: string | null;
  createdAt: Date;                     // unixepoch timestamp
}
```

### 8.5 tool_call result 타입

```typescript
/** render_widget 도구의 반환 타입 */
export interface RenderWidgetResult {
  widgetId: string;
  widgetType: WidgetType;
  title: string;
  code: string;
  data: Record<string, unknown>;
  warnings: string[];                  // sanitizer 경고
}
```

---

## 9. DB 변경 — chat_widgets 테이블

### 9.1 Drizzle 스키마

```typescript
// app/features/chat/db/schema.ts에 추가

export const chatWidgets = sqliteTable(
  "chat_widgets",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    widgetType: text("widget_type").notNull(),    // WidgetType enum
    title: text("title").notNull(),
    code: text("code").notNull(),                 // sanitized HTML/CSS/JS
    data: text("data", { mode: "json" })          // JSON column (Drizzle 자동 직렬화)
      .notNull()
      .$type<Record<string, unknown>>(),
    description: text("description"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    conversationIdx: index("idx_chat_widgets_conversation").on(table.conversationId),
  }),
);
```

### 9.2 DB 관계

```
conversations (1) ──< chat_widgets (N)
    │ id                   │ conversationId (FK, CASCADE)
    │                      │ widgetId (PK)
    │                      │ widgetType
    │                      │ code
    │                      │ data (JSON)
```

**설계 결정**: 위젯을 별도 테이블로 분리하는 이유:
- `messages` 테이블에 code 컬럼을 추가하면 기존 메시지 쿼리 성능 저하
- 위젯 데이터(code + data)는 텍스트 메시지보다 훨씬 크기 때문 (최대 10KB)
- 위젯 캐시/재렌더링 시 독립 조회 필요

---

## 10. 마이그레이션

### 10.1 SQL 마이그레이션 파일

```sql
-- migrations/0067_create_chat_widgets.sql

CREATE TABLE IF NOT EXISTS chat_widgets (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL
    REFERENCES conversations(id) ON DELETE CASCADE,
  widget_type TEXT NOT NULL,
  title TEXT NOT NULL,
  code TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  description TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_chat_widgets_conversation
  ON chat_widgets(conversation_id);
```

### 10.2 tests/helpers/db.ts 동기화

```typescript
// tests/helpers/db.ts — SQL_FILES 배열에 추가:
"migrations/0067_create_chat_widgets.sql",
```

> **IMPORTANT**: 마이그레이션 추가 시 `tests/helpers/db.ts`에도 반드시 SQL 파일 추가 (CLAUDE.md Gotchas).

---

## 11. 테스트 계획

### 11.1 단위 테스트

| # | 테스트 대상 | 파일 | 테스트 항목 | 수량 |
|---|-----------|------|-----------|------|
| U1 | `widget-sanitizer.ts` | `tests/unit/chat/widget-sanitizer.test.ts` | 외부 스크립트 제거, 사이즈 제한, 위험 패턴 차단, 정상 코드 통과 | ~12 |
| U2 | `widget-theme.ts` | `tests/unit/chat/widget-theme.test.ts` | buildThemeStyleBlock, buildSrcdoc 출력 검증, CSP 포함 확인 | ~6 |
| U3 | `widget-protocol.ts` | `tests/unit/chat/widget-protocol.test.ts` | 메시지 타입 가드, origin 검증 헬퍼 | ~4 |
| U4 | `WidgetRenderer` | `tests/unit/chat/widget-renderer.test.ts` | 렌더링, 리사이즈, 타임아웃, 에러 폴백, 테마 변경 | ~10 |
| U5 | `WidgetSkeleton` | (U4에 포함) | 로딩 상태 렌더링 | ~2 |
| U6 | `WidgetErrorFallback` | (U4에 포함) | 에러 메시지 + JSON fallback 렌더링 | ~2 |

### 11.2 통합 테스트

| # | 테스트 대상 | 파일 | 테스트 항목 | 수량 |
|---|-----------|------|-----------|------|
| I1 | `render_widget` 도구 | `tests/integration/chat/widget-tool.test.ts` | 도구 실행 → DB 저장 → 결과 반환 플로우 | ~6 |
| I2 | ChatPanel + Widget | `tests/integration/chat/widget-chat.test.ts` | SSE tool_call → WidgetRenderer 렌더링 E2E | ~4 |

### 11.3 보안 테스트

| # | 테스트 항목 | 검증 내용 |
|---|-----------|----------|
| S1 | XSS 방어 | `<script src="evil.js">` 삽입 → sanitizer가 제거 |
| S2 | 네트워크 차단 | `fetch("https://evil.com")` → CSP 차단 확인 |
| S3 | DOM 접근 차단 | `parent.document.cookie` → sandbox 차단 확인 |
| S4 | 네비게이션 차단 | `top.location = "..."` → sandbox 차단 확인 |
| S5 | 코드 사이즈 | 11KB 코드 → sanitizer 거부 확인 |

### 11.4 총 예상 테스트: ~46개

---

## 수정 파일 총괄

### 신규 파일 (7개)

| # | 파일 | 역할 |
|---|------|------|
| 1 | `app/features/chat/ui/WidgetRenderer.tsx` | sandboxed iframe 위젯 렌더러 |
| 2 | `app/features/chat/ui/WidgetSkeleton.tsx` | 위젯 로딩 스켈레톤 |
| 3 | `app/features/chat/ui/WidgetErrorFallback.tsx` | 위젯 에러 폴백 |
| 4 | `app/features/chat/lib/widget-sanitizer.ts` | 위젯 코드 새니타이징 |
| 5 | `app/features/chat/lib/widget-theme.ts` | CSS 변수 추출 + srcdoc 조립 |
| 6 | `app/features/chat/lib/widget-protocol.ts` | PostMessage 타입 + 프로토콜 |
| 7 | `app/features/chat/agent/tool-schemas/widget-schemas.ts` | render_widget 도구 스키마 |

### 수정 파일 (5개)

| # | 파일 | 변경 내용 |
|---|------|----------|
| 1 | `app/features/chat/ui/ToolExecution.tsx` | `formatResult()` — render_widget case 추가 |
| 2 | `app/features/chat/agent/tool-schemas/index.ts` | `WIDGET_TOOLS` export 추가 |
| 3 | `app/features/chat/agent/tool-registry.ts` | `WIDGET_TOOLS` 등록 (ADVISORY level) |
| 4 | `app/features/chat/db/schema.ts` | `chatWidgets` 테이블 추가 |
| 5 | `app/features/chat/agent/agent-pipeline.ts` | `render_widget` 도구 핸들러 추가 |

### 마이그레이션 (1개)

| # | 파일 | SQL |
|---|------|-----|
| 1 | `migrations/0067_create_chat_widgets.sql` | chat_widgets 테이블 + 인덱스 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-18 | Initial — F48 Generative UI 설계 문서. 11개 섹션: 컴포넌트 아키텍처, UI 설계, PostMessage 프로토콜, iframe 보안 6계층, CSS 테마 시스템, Agent 도구 스키마, SSE 이벤트, 타입 정의, DB 스키마, 마이그레이션, 테스트 46건 | Sinclair Seo |
