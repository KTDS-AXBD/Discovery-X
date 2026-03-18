// ─── 위젯 타입 ────────────────────────────────────────────────
export type WidgetType =
  | "chart" // bar, line, pie, radar — Canvas 2D API
  | "diagram" // flow, tree, mind-map — SVG 직접 생성
  | "table" // sortable, filterable — 순수 HTML/CSS/JS
  | "metric-card" // KPI 카드 그리드 — CSS Grid
  | "timeline" // 시간축 이벤트 — SVG/CSS
  | "comparison"; // A/B 비교 뷰 — CSS Grid

// ─── Host → iframe 메시지 ─────────────────────────────────────
export interface WidgetInitMessage {
  type: "widget:init";
  data: Record<string, unknown>;
  theme: Record<string, string>;
}

export interface WidgetThemeChangeMessage {
  type: "widget:theme-change";
  theme: Record<string, string>;
}

// ─── iframe → Host 메시지 ─────────────────────────────────────
export interface WidgetResizeMessage {
  type: "widget:resize";
  height: number;
}

export interface WidgetActionMessage {
  type: "widget:action";
  action: "navigate" | "filter" | "select" | "send-prompt";
  payload: Record<string, unknown>;
}

export interface WidgetErrorMessage {
  type: "widget:error";
  message: string;
}

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

// ─── 타입 가드 ────────────────────────────────────────────────
export function isWidgetMessage(data: unknown): data is WidgetMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    typeof (data as { type: unknown }).type === "string" &&
    (data as { type: string }).type.startsWith("widget:")
  );
}

// ─── DB 레코드 타입 ───────────────────────────────────────────
export interface ChatWidget {
  id: string;
  conversationId: string;
  widgetType: WidgetType;
  title: string;
  code: string;
  data: Record<string, unknown>;
  description: string | null;
  tenantId: string | null;
  createdAt: Date;
}

// ─── render_widget 도구 반환 타입 ─────────────────────────────
export interface RenderWidgetResult {
  widgetId: string;
  widgetType: WidgetType;
  title: string;
  code: string;
  data: Record<string, unknown>;
  warnings: string[];
}
