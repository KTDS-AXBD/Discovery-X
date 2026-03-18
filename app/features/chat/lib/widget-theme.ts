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
export function buildSrcdoc(
  agentCode: string,
  themeOverride?: Record<string, string>
): string {
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
    var _ro = new ResizeObserver(function() {
      parent.postMessage({
        type: 'widget:resize',
        height: document.body.scrollHeight
      }, '*');
    });
    _ro.observe(document.body);

    // ─── 호스트 메시지 수신 ──────────────────────────────────
    window.addEventListener('message', function(e) {
      if (e.data && e.data.type === 'widget:init') {
        window.__WIDGET_DATA__ = e.data.data;
        window.__WIDGET_THEME__ = e.data.theme;
        if (e.data.theme) {
          var root = document.documentElement;
          Object.entries(e.data.theme).forEach(function(entry) {
            root.style.setProperty(entry[0], entry[1]);
          });
        }
        window.dispatchEvent(new CustomEvent('widget:data-ready'));
      } else if (e.data && e.data.type === 'widget:theme-change') {
        if (e.data.theme) {
          var root = document.documentElement;
          Object.entries(e.data.theme).forEach(function(entry) {
            root.style.setProperty(entry[0], entry[1]);
          });
        }
      }
    });

    // ─── 에러 핸들러 ─────────────────────────────────────────
    window.onerror = function(msg) {
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
