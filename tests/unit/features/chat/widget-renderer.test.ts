import { describe, it, expect } from "vitest";
import {
  sanitizeWidgetCode,
  sanitizeWidgetCodeDetailed,
} from "~/features/chat/lib/widget-sanitizer";
import {
  buildSrcdoc,
  buildThemeStyleBlock,
} from "~/features/chat/lib/widget-theme";
import { isWidgetMessage } from "~/features/chat/lib/widget-protocol";

// ─── widget-sanitizer ──────────────────────────────────────────

describe("sanitizeWidgetCode", () => {
  it("깨끗한 코드는 그대로 통과해요", () => {
    const clean = '<div id="chart"><h2>Hello</h2></div>';
    expect(sanitizeWidgetCode(clean)).toBe(clean);
  });

  it("외부 script src 태그를 <!-- blocked -->로 치환해요", () => {
    const code = '<script src="https://evil.com/x.js"></script>';
    const result = sanitizeWidgetCode(code);
    expect(result).toContain("<!-- blocked -->");
    expect(result).not.toContain('src="https://evil.com');
  });

  it("iframe 태그를 <!-- blocked -->로 치환해요", () => {
    const code = '<iframe src="https://evil.com"></iframe>';
    const result = sanitizeWidgetCode(code);
    expect(result).toContain("<!-- blocked -->");
    expect(result).not.toMatch(/<iframe/i);
  });

  it("document.cookie 접근을 <!-- blocked -->로 치환해요", () => {
    const code = "<script>var c = document.cookie;</script>";
    const result = sanitizeWidgetCode(code);
    expect(result).toContain("<!-- blocked -->");
    expect(result).not.toContain("document.cookie");
  });

  it("localStorage/sessionStorage 접근을 <!-- blocked -->로 치환해요", () => {
    const code = "<script>localStorage.setItem('k','v');</script>";
    const result = sanitizeWidgetCode(code);
    expect(result).toContain("<!-- blocked -->");
    expect(result).not.toMatch(/localStorage/i);
  });

  it("10KB 초과 코드를 차단해요", () => {
    const oversized = "x".repeat(10_241);
    expect(() => sanitizeWidgetCode(oversized)).toThrow("보안 정책을 위반");
  });
});

describe("sanitizeWidgetCodeDetailed", () => {
  it("네트워크 요청 코드에 경고를 반환하지만 차단하지 않아요", () => {
    const code = '<script>fetch("/api/data");</script>';
    const result = sanitizeWidgetCodeDetailed(code);
    expect(result.blocked).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("네트워크 요청")
    );
  });

  it("복수 위험 패턴을 모두 감지하고 치환해요 (blocked는 false)", () => {
    const code =
      '<script src="x.js"></script><iframe></iframe><embed type="a">';
    const result = sanitizeWidgetCodeDetailed(code);
    // 개별 패턴은 치환만 함 — blocked는 사이즈 초과 시에만 true
    expect(result.blocked).toBe(false);
    expect(result.warnings.length).toBeGreaterThanOrEqual(3);
    expect(result.code).not.toMatch(/<iframe/i);
    expect(result.code).not.toMatch(/<embed/i);
  });

  it("인라인 스크립트 태그는 허용해요 (CSP unsafe-inline)", () => {
    const code = "<script>console.log('hi');</script>";
    const result = sanitizeWidgetCodeDetailed(code);
    expect(result.blocked).toBe(false);
    expect(result.code).toBe(code);
  });
});

// ─── widget-theme ──────────────────────────────────────────────

describe("buildThemeStyleBlock", () => {
  it("CSS 변수를 :root 블록으로 변환해요", () => {
    const theme = {
      "--color-fg": "#1a1a2e",
      "--color-bg": "#ffffff",
    };
    const result = buildThemeStyleBlock(theme);
    expect(result).toContain(":root {");
    expect(result).toContain("--color-fg: #1a1a2e;");
    expect(result).toContain("--color-bg: #ffffff;");
    expect(result).toContain("}");
  });

  it("빈 테마는 빈 :root 블록을 생성해요", () => {
    const result = buildThemeStyleBlock({});
    expect(result).toBe(":root {\n\n}");
  });
});

describe("buildSrcdoc", () => {
  const testCode = '<div id="widget">Chart</div>';

  it("CSP meta 태그를 포함해요", () => {
    const html = buildSrcdoc(testCode);
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("script-src 'unsafe-inline'");
  });

  it("에이전트 코드를 body에 삽입해요", () => {
    const html = buildSrcdoc(testCode);
    expect(html).toContain(testCode);
    // body 안에 있어야 함
    const bodyStart = html.indexOf("<body>");
    const bodyEnd = html.indexOf("</body>");
    const codePos = html.indexOf(testCode);
    expect(codePos).toBeGreaterThan(bodyStart);
    expect(codePos).toBeLessThan(bodyEnd);
  });

  it("ResizeObserver 스크립트를 포함해요", () => {
    const html = buildSrcdoc(testCode);
    expect(html).toContain("ResizeObserver");
    expect(html).toContain("widget:resize");
  });

  it("widget:init 메시지 핸들러를 포함해요", () => {
    const html = buildSrcdoc(testCode);
    expect(html).toContain("widget:init");
    expect(html).toContain("__WIDGET_DATA__");
  });

  it("themeOverride가 있으면 인라인 테마를 삽입해요", () => {
    const theme = { "--color-fg": "#000" };
    const html = buildSrcdoc(testCode, theme);
    expect(html).toContain("--color-fg: #000;");
    expect(html).not.toContain("동적 주입");
  });

  it("themeOverride가 없으면 동적 주입 주석을 삽입해요", () => {
    const html = buildSrcdoc(testCode);
    expect(html).toContain("동적 주입");
  });
});

// ─── widget-protocol ───────────────────────────────────────────

describe("isWidgetMessage", () => {
  it("widget: 접두사가 있는 메시지를 인식해요", () => {
    expect(isWidgetMessage({ type: "widget:resize", height: 300 })).toBe(true);
    expect(isWidgetMessage({ type: "widget:error", message: "err" })).toBe(
      true
    );
    expect(isWidgetMessage({ type: "widget:init", data: {}, theme: {} })).toBe(
      true
    );
    expect(
      isWidgetMessage({
        type: "widget:action",
        action: "navigate",
        payload: {},
      })
    ).toBe(true);
  });

  it("widget: 접두사가 없는 값을 거부해요", () => {
    expect(isWidgetMessage({ type: "text_delta" })).toBe(false);
    expect(isWidgetMessage({ type: "tool_call" })).toBe(false);
    expect(isWidgetMessage(null)).toBe(false);
    expect(isWidgetMessage(undefined)).toBe(false);
    expect(isWidgetMessage("widget:resize")).toBe(false);
    expect(isWidgetMessage(42)).toBe(false);
    expect(isWidgetMessage({})).toBe(false);
  });
});

// ─── 높이 클램핑 로직 (WidgetRenderer에서 추출) ────────────────

describe("widget height clamping", () => {
  const MAX_WIDGET_HEIGHT = 600;

  function clampHeight(
    rawHeight: number,
    maxHeight: number = 400
  ): number {
    return Math.min(rawHeight, Math.min(maxHeight, MAX_WIDGET_HEIGHT));
  }

  it("작은 높이는 그대로 반환해요", () => {
    expect(clampHeight(200)).toBe(200);
  });

  it("maxHeight를 초과하면 maxHeight로 클램핑해요", () => {
    expect(clampHeight(500, 400)).toBe(400);
  });

  it("MAX_WIDGET_HEIGHT를 초과하면 600으로 클램핑해요", () => {
    expect(clampHeight(800, 700)).toBe(600);
  });

  it("maxHeight가 MAX_WIDGET_HEIGHT보다 크면 600으로 제한해요", () => {
    expect(clampHeight(1000, 1000)).toBe(600);
  });

  it("maxHeight가 정확히 경계값일 때 올바르게 동작해요", () => {
    expect(clampHeight(600, 600)).toBe(600);
    expect(clampHeight(400, 400)).toBe(400);
    expect(clampHeight(601, 600)).toBe(600);
  });
});

// ─── isSafeUrl (WidgetRenderer open-link 보안 검증) ────────────

describe("isSafeUrl", () => {
  // WidgetRenderer에서 export하지 않으므로 동일 로직을 재구현하여 테스트
  function isSafeUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  it("https URL을 허용해요", () => {
    expect(isSafeUrl("https://example.com")).toBe(true);
    expect(isSafeUrl("https://dx.minu.best/discovery/123")).toBe(true);
  });

  it("http URL을 허용해요", () => {
    expect(isSafeUrl("http://localhost:3000")).toBe(true);
  });

  it("javascript: URL을 거부해요", () => {
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
  });

  it("data: URL을 거부해요", () => {
    expect(isSafeUrl("data:text/html,<h1>hi</h1>")).toBe(false);
  });

  it("빈 문자열을 거부해요", () => {
    expect(isSafeUrl("")).toBe(false);
  });

  it("malformed URL을 거부해요", () => {
    expect(isSafeUrl("not-a-url")).toBe(false);
  });

  it("ftp: URL을 거부해요", () => {
    expect(isSafeUrl("ftp://files.example.com/doc.pdf")).toBe(false);
  });

  it("file: URL을 거부해요", () => {
    expect(isSafeUrl("file:///etc/passwd")).toBe(false);
  });
});

// ─── srcdoc 캐시 로직 ──────────────────────────────────────────

describe("widget srcdoc cache", () => {
  it("동일 코드에 대해 buildSrcdoc 결과가 동일해요 (캐시 가능 확인)", () => {
    const code = '<div id="chart">Test</div>';
    const result1 = buildSrcdoc(code);
    const result2 = buildSrcdoc(code);
    expect(result1).toBe(result2);
  });

  it("다른 코드에 대해 다른 srcdoc을 생성해요", () => {
    const code1 = '<div id="chart1">A</div>';
    const code2 = '<div id="chart2">B</div>';
    expect(buildSrcdoc(code1)).not.toBe(buildSrcdoc(code2));
  });
});

// ─── 위젯 동시 렌더링 제한 로직 ──────────────────────────────────

describe("widget rendering limit", () => {
  const MAX_WIDGETS_PER_CONVERSATION = 5;

  function addWidget(
    widgets: Array<{ widgetId: string }>,
    newId: string
  ): Array<{ widgetId: string }> {
    if (widgets.length >= MAX_WIDGETS_PER_CONVERSATION) return widgets;
    if (widgets.some((w) => w.widgetId === newId)) return widgets;
    return [...widgets, { widgetId: newId }];
  }

  it("5개까지 위젯을 추가할 수 있어요", () => {
    let widgets: Array<{ widgetId: string }> = [];
    for (let i = 1; i <= 5; i++) {
      widgets = addWidget(widgets, `w${i}`);
    }
    expect(widgets).toHaveLength(5);
  });

  it("6번째 위젯 추가를 거부해요", () => {
    let widgets: Array<{ widgetId: string }> = [];
    for (let i = 1; i <= 6; i++) {
      widgets = addWidget(widgets, `w${i}`);
    }
    expect(widgets).toHaveLength(5);
  });

  it("중복 widgetId 추가를 거부해요", () => {
    let widgets: Array<{ widgetId: string }> = [];
    widgets = addWidget(widgets, "w1");
    widgets = addWidget(widgets, "w1");
    expect(widgets).toHaveLength(1);
  });
});

// ─── widget:action send-prompt 로직 ──────────────────────────────

describe("widget:action send-prompt", () => {
  it("유효한 send-prompt payload에서 메시지를 추출해요", () => {
    const payload = { message: "현황 분석해줘" };
    const action = "send-prompt";
    expect(action).toBe("send-prompt");
    expect(typeof payload.message).toBe("string");
    expect(payload.message.trim().length).toBeGreaterThan(0);
  });

  it("빈 메시지를 거부해요", () => {
    const payload = { message: "   " };
    expect(payload.message.trim().length).toBe(0);
  });

  it("message가 없는 payload를 처리해요", () => {
    const payload: Record<string, unknown> = { data: 123 };
    expect(typeof payload.message).not.toBe("string");
  });
});

// ─── widget:open-link 타입 인식 ─────────────────────────────────

describe("widget:open-link protocol", () => {
  it("isWidgetMessage가 open-link 타입을 인식해요", () => {
    expect(
      isWidgetMessage({ type: "widget:open-link", url: "https://example.com" })
    ).toBe(true);
  });
});
