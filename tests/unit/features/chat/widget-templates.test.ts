import { describe, it, expect } from "vitest";
import {
  getWidgetTemplate,
  chartTemplate,
  diagramTemplate,
  tableTemplate,
  metricCardTemplate,
  timelineTemplate,
  comparisonTemplate,
} from "~/features/chat/lib/widget-templates";

// ─── chartTemplate ──────────────────────────────────────────────

describe("chartTemplate", () => {
  it("bar chart HTML을 반환해요", () => {
    const html = chartTemplate({
      chartType: "bar",
      labels: ["A", "B", "C"],
      values: [10, 20, 30],
    });
    expect(html).toContain("<canvas");
    expect(html).toContain('"bar"');
    expect(html).toContain('"A"');
    expect(html).toContain("drawBar");
  });

  it("pie chart HTML을 반환해요", () => {
    const html = chartTemplate({
      chartType: "pie",
      labels: ["진행중", "완료"],
      values: [5, 12],
    });
    expect(html).toContain('"pie"');
    expect(html).toContain("drawPie");
  });

  it("line chart HTML을 반환해요", () => {
    const html = chartTemplate({
      chartType: "line",
      labels: ["1월", "2월", "3월"],
      values: [100, 150, 120],
    });
    expect(html).toContain('"line"');
    expect(html).toContain("drawLine");
  });

  it("chartType 미지정 시 bar 기본값을 사용해요", () => {
    const html = chartTemplate({ labels: ["X"], values: [1] });
    expect(html).toContain('"bar"');
  });

  it("title이 있으면 헤더를 포함해요", () => {
    const html = chartTemplate({
      chartType: "bar",
      labels: ["A"],
      values: [10],
      title: "Discovery 현황",
    });
    expect(html).toContain("Discovery 현황");
  });

  it("title이 없으면 헤더를 생략해요", () => {
    const html = chartTemplate({
      chartType: "bar",
      labels: ["A"],
      values: [10],
    });
    expect(html).not.toContain("font-weight:600");
  });

  it("빈 데이터를 처리해요", () => {
    const html = chartTemplate({});
    expect(html).toContain("<canvas");
    // labels/values가 빈 배열이어도 HTML 구조 유효
    expect(html).toContain("[]");
  });

  it("widget:data-ready 이벤트 리스너를 포함해요", () => {
    const html = chartTemplate({ labels: ["A"], values: [1] });
    expect(html).toContain("widget:data-ready");
    expect(html).toContain("__WIDGET_DATA__");
  });

  it("CSS 변수 참조를 포함해요", () => {
    const html = chartTemplate({ labels: ["A"], values: [1] });
    expect(html).toContain("--color-fg");
    expect(html).toContain("--color-fg-brand");
  });

  it("XSS 위험 문자를 이스케이프해요", () => {
    const html = chartTemplate({
      chartType: "bar",
      labels: ['<script>alert(1)</script>'],
      values: [1],
      title: '<img onerror="alert(1)">',
    });
    // JSON 데이터 내부: <> → \u003c/\u003e (script injection 방지)
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("\\u003cscript\\u003e");
    // HTML title: esc() 적용
    expect(html).not.toContain('onerror="alert');
    expect(html).toContain("&lt;img");
  });
});

// ─── diagramTemplate ────────────────────────────────────────────

describe("diagramTemplate", () => {
  it("SVG 기반 다이어그램을 반환해요", () => {
    const html = diagramTemplate({
      nodes: [
        { id: "n1", label: "시작" },
        { id: "n2", label: "처리" },
      ],
      edges: [{ from: "n1", to: "n2" }],
    });
    expect(html).toContain("<svg");
    expect(html).toContain("시작");
    expect(html).toContain("처리");
    expect(html).toContain("<rect");
    expect(html).toContain("<path");
  });

  it("엣지 레이블이 있으면 표시해요", () => {
    const html = diagramTemplate({
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [{ from: "a", to: "b", label: "승인" }],
    });
    expect(html).toContain("승인");
  });

  it("빈 노드 배열을 처리해요", () => {
    const html = diagramTemplate({ nodes: [], edges: [] });
    expect(html).toContain("<svg");
  });

  it("arrow marker를 포함해요", () => {
    const html = diagramTemplate({
      nodes: [{ id: "n1", label: "A" }],
      edges: [],
    });
    expect(html).toContain('id="arrow"');
    expect(html).toContain("<marker");
  });

  it("존재하지 않는 노드 엣지를 무시해요", () => {
    const html = diagramTemplate({
      nodes: [{ id: "n1", label: "A" }],
      edges: [{ from: "n1", to: "n999" }],
    });
    // 유효하지 않은 엣지는 빈 문자열로 처리됨
    expect(html).toContain("<svg");
    expect(html).toContain("A");
  });
});

// ─── tableTemplate ──────────────────────────────────────────────

describe("tableTemplate", () => {
  it("HTML 테이블을 반환해요", () => {
    const html = tableTemplate({
      columns: ["이름", "점수"],
      rows: [
        ["Alice", 95],
        ["Bob", 87],
      ],
    });
    expect(html).toContain("<table");
    expect(html).toContain("이름");
    expect(html).toContain("점수");
    expect(html).toContain("Alice");
    expect(html).toContain("95");
  });

  it("정렬 UI를 포함해요", () => {
    const html = tableTemplate({
      columns: ["Col"],
      rows: [["val"]],
    });
    expect(html).toContain("↕");
    expect(html).toContain("cursor:pointer");
    expect(html).toContain("click");
  });

  it("짝수/홀수 행 배경색을 교대해요", () => {
    const html = tableTemplate({
      columns: ["A"],
      rows: [["r0"], ["r1"], ["r2"]],
    });
    expect(html).toContain("transparent");
    expect(html).toContain("--color-surface-secondary");
  });

  it("빈 데이터를 처리해요", () => {
    const html = tableTemplate({ columns: [], rows: [] });
    expect(html).toContain("<table");
    expect(html).toContain("<thead>");
  });

  it("정렬 스크립트를 포함해요", () => {
    const html = tableTemplate({
      columns: ["A"],
      rows: [["1"]],
    });
    expect(html).toContain("sort");
    expect(html).toContain("localeCompare");
  });
});

// ─── metricCardTemplate ─────────────────────────────────────────

describe("metricCardTemplate", () => {
  it("CSS Grid 기반 메트릭 카드를 반환해요", () => {
    const html = metricCardTemplate({
      metrics: [
        { label: "디스커버리", value: 42 },
        { label: "실험", value: 12 },
      ],
    });
    expect(html).toContain("grid");
    expect(html).toContain("디스커버리");
    expect(html).toContain("42");
    expect(html).toContain("실험");
    expect(html).toContain("12");
  });

  it("delta 필드가 있으면 표시해요", () => {
    const html = metricCardTemplate({
      metrics: [
        { label: "매출", value: "1.2M", delta: "+12%", deltaType: "positive" },
      ],
    });
    expect(html).toContain("+12%");
    expect(html).toContain("--color-fg-success");
  });

  it("deltaType에 따라 색상이 달라요", () => {
    const pos = metricCardTemplate({
      metrics: [{ label: "A", value: 1, delta: "+1", deltaType: "positive" }],
    });
    const neg = metricCardTemplate({
      metrics: [{ label: "B", value: 1, delta: "-1", deltaType: "negative" }],
    });
    const neutral = metricCardTemplate({
      metrics: [{ label: "C", value: 1, delta: "0", deltaType: "neutral" }],
    });
    expect(pos).toContain("--color-fg-success");
    expect(neg).toContain("--color-fg-error");
    expect(neutral).toContain("--color-fg-tertiary");
  });

  it("delta 없는 메트릭은 delta 행을 생략해요", () => {
    const html = metricCardTemplate({
      metrics: [{ label: "Count", value: 5 }],
    });
    expect(html).not.toContain("--color-fg-success");
    expect(html).not.toContain("--color-fg-error");
  });

  it("빈 메트릭 배열을 처리해요", () => {
    const html = metricCardTemplate({ metrics: [] });
    expect(html).toContain("grid");
  });
});

// ─── timelineTemplate ───────────────────────────────────────────

describe("timelineTemplate", () => {
  it("타임라인 이벤트를 렌더링해요", () => {
    const html = timelineTemplate({
      events: [
        { date: "2024-01-01", title: "프로젝트 시작" },
        { date: "2024-02-15", title: "MVP 출시", description: "첫 배포" },
      ],
    });
    expect(html).toContain("2024-01-01");
    expect(html).toContain("프로젝트 시작");
    expect(html).toContain("MVP 출시");
    expect(html).toContain("첫 배포");
  });

  it("description이 없으면 생략해요", () => {
    const html = timelineTemplate({
      events: [{ date: "2024-01-01", title: "이벤트" }],
    });
    expect(html).toContain("이벤트");
    // description div가 생성되지 않아야 함
    const descMatches = html.match(/--color-fg-secondary/g);
    // only the date and timeline dot have secondary color, not an extra description
    expect(descMatches?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it("타임라인 도트를 포함해요", () => {
    const html = timelineTemplate({
      events: [{ date: "2024-01-01", title: "A" }],
    });
    expect(html).toContain("border-radius:50%");
    expect(html).toContain("--color-fg-brand");
  });

  it("빈 이벤트 배열을 처리해요", () => {
    const html = timelineTemplate({ events: [] });
    expect(html).toContain("padding:12px");
  });
});

// ─── comparisonTemplate ─────────────────────────────────────────

describe("comparisonTemplate", () => {
  it("비교 테이블을 렌더링해요", () => {
    const html = comparisonTemplate({
      dimensions: ["가격", "속도", "정확도"],
      items: [
        { label: "모델 A", values: { 가격: "$10", 속도: "1.2s", 정확도: "95%" } },
        { label: "모델 B", values: { 가격: "$5", 속도: "0.8s", 정확도: "91%" } },
      ],
    });
    expect(html).toContain("<table");
    expect(html).toContain("모델 A");
    expect(html).toContain("모델 B");
    expect(html).toContain("$10");
    expect(html).toContain("0.8s");
    expect(html).toContain("95%");
  });

  it("항목이 없으면 안내 메시지를 표시해요", () => {
    const html = comparisonTemplate({ dimensions: ["A"], items: [] });
    expect(html).toContain("비교 데이터 없음");
  });

  it("누락된 값을 '-'로 표시해요", () => {
    const html = comparisonTemplate({
      dimensions: ["가격", "속도"],
      items: [{ label: "X", values: { 가격: "100" } }],
    });
    // 속도 필드가 values에 없으므로 '-'로 대체
    expect(html).toContain("-");
  });

  it("짝수/홀수 행 배경색을 교대해요", () => {
    const html = comparisonTemplate({
      dimensions: ["D1", "D2", "D3"],
      items: [{ label: "A", values: { D1: "1", D2: "2", D3: "3" } }],
    });
    expect(html).toContain("transparent");
    expect(html).toContain("--color-surface-secondary");
  });
});

// ─── getWidgetTemplate dispatcher ───────────────────────────────

describe("getWidgetTemplate", () => {
  it("chart 타입을 chartTemplate으로 라우팅해요", () => {
    const html = getWidgetTemplate("chart", {
      chartType: "bar",
      labels: ["A"],
      values: [1],
    });
    expect(html).toContain("<canvas");
  });

  it("diagram 타입을 diagramTemplate으로 라우팅해요", () => {
    const html = getWidgetTemplate("diagram", {
      nodes: [{ id: "n1", label: "A" }],
      edges: [],
    });
    expect(html).toContain("<svg");
  });

  it("table 타입을 tableTemplate으로 라우팅해요", () => {
    const html = getWidgetTemplate("table", {
      columns: ["A"],
      rows: [["1"]],
    });
    expect(html).toContain("<table");
  });

  it("metric-card 타입을 metricCardTemplate으로 라우팅해요", () => {
    const html = getWidgetTemplate("metric-card", {
      metrics: [{ label: "KPI", value: 42 }],
    });
    expect(html).toContain("grid");
    expect(html).toContain("42");
  });

  it("timeline 타입을 timelineTemplate으로 라우팅해요", () => {
    const html = getWidgetTemplate("timeline", {
      events: [{ date: "2024-01", title: "Event" }],
    });
    expect(html).toContain("2024-01");
  });

  it("comparison 타입을 comparisonTemplate으로 라우팅해요", () => {
    const html = getWidgetTemplate("comparison", {
      dimensions: ["D1"],
      items: [{ label: "A", values: { D1: "v" } }],
    });
    expect(html).toContain("<table");
    expect(html).toContain("A");
  });

  it("알 수 없는 widgetType에 에러 HTML을 반환해요", () => {
    const html = getWidgetTemplate("unknown" as never, {});
    expect(html).toContain("지원하지 않는 위젯 타입");
    expect(html).toContain("unknown");
  });

  it("알 수 없는 widgetType에서 XSS를 이스케이프해요", () => {
    const html = getWidgetTemplate('<script>' as never, {});
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
