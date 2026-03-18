/**
 * Widget tool schemas — Generative UI (F48)
 * Agent가 인터랙티브 위젯을 생성할 때 사용하는 render_widget 도구 스키마.
 */
import type { ClaudeTool } from "~/lib/ai";

export const WIDGET_TOOLS: ClaudeTool[] = [
  {
    name: "render_widget",
    description: `인터랙티브 시각화 위젯을 생성합니다. 데이터를 차트, 다이어그램, 테이블, 지표 카드 등으로 시각화할 때 사용하세요.

규칙:
- 모든 코드는 인라인 HTML/CSS/JS로 작성 (외부 URL/CDN 금지)
- 차트는 Canvas 2D API, 다이어그램은 SVG 직접 생성
- CSS 변수(--color-fg, --color-fg-brand 등)로 테마 호환성 확보
- window.__WIDGET_DATA__로 데이터 접근 (widget:data-ready 이벤트 대기)
- 최대 코드 크기: 10KB
- fetch(), XMLHttpRequest, WebSocket 사용 금지 (CSP 차단)
- <script src=...>, <link href=...>, <iframe> 태그 사용 금지`,
    input_schema: {
      type: "object",
      required: ["widgetType", "title", "code", "data"],
      properties: {
        widgetType: {
          type: "string",
          enum: ["chart", "diagram", "table", "metric-card", "timeline", "comparison"],
          description: "위젯 유형. chart(막대/선/파이), diagram(플로우/트리), table(정렬/필터), metric-card(KPI), timeline(시간축), comparison(A/B 비교)",
        },
        title: {
          type: "string",
          description: "위젯 제목 (예: 'Discovery 상태 분포', 'Q1 실험 결과')",
        },
        code: {
          type: "string",
          description: "HTML/CSS/JS 인라인 코드. <div id='root'>...</div><style>...</style><script>...</script> 구조 권장. window.__WIDGET_DATA__로 데이터 접근. window.addEventListener('widget:data-ready', handler)로 데이터 준비 대기.",
        },
        data: {
          type: "object",
          description: "위젯에 전달할 구조화 데이터 (JSON). code 내에서 window.__WIDGET_DATA__로 접근 가능.",
        },
        description: {
          type: "string",
          description: "위젯 설명 (접근성 + 로깅용, 선택 필드)",
        },
      },
    },
  },
];
