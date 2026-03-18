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
  code: string;
  data: Record<string, unknown>;
  maxHeight?: number;
  onSendPrompt?: (message: string) => void;
}

type WidgetState = "loading" | "ready" | "error" | "timeout";

const RENDER_TIMEOUT_MS = 5_000;
const MAX_WIDGET_HEIGHT = 600;
const DEFAULT_MAX_HEIGHT = 400;

/** URL이 안전한지 검증 (http/https만 허용) */
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** widgetId 기반 srcdoc 캐시 — 동일 위젯 재렌더링 방지 */
const srcdocCache = new Map<string, string>();

/** DOM에서 현재 테마 CSS 변수 추출 */
function extractThemeVarsFromDOM(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const cs = getComputedStyle(document.documentElement);
  const vars = [
    "--color-fg",
    "--color-fg-secondary",
    "--color-fg-tertiary",
    "--color-fg-brand",
    "--color-fg-error",
    "--color-fg-success",
    "--color-bg",
    "--color-surface",
    "--color-surface-card",
    "--color-surface-secondary",
    "--color-line",
    "--color-line-subtle",
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
    chart: "\u{1F4CA}",
    diagram: "\u{1F500}",
    table: "\u{1F4CB}",
    "metric-card": "\u{1F4C8}",
    timeline: "\u{23F3}",
    comparison: "\u{2696}\u{FE0F}",
  };
  return <span className="text-sm">{icons[type] || "\u{1F4CA}"}</span>;
}

export function WidgetRenderer({
  widgetId,
  widgetType,
  title,
  code,
  data,
  maxHeight = DEFAULT_MAX_HEIGHT,
  onSendPrompt,
}: WidgetRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<WidgetState>("loading");
  const [height, setHeight] = useState(200);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const committedHtmlRef = useRef<string | null>(null);

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
          setHeight(
            Math.min(msg.height, Math.min(maxHeight, MAX_WIDGET_HEIGHT))
          );
          break;
        case "widget:action":
          if (msg.action === "send-prompt" && onSendPrompt) {
            const message = (msg.payload as { message?: string })?.message;
            if (typeof message === "string" && message.trim()) {
              onSendPrompt(message);
            }
          } else {
            // navigate/filter/select — Phase 3 후속 확장
            console.log("[Widget Action]", msg.action, msg.payload);
          }
          break;
        case "widget:open-link": {
          const url = (msg as { url?: string }).url;
          if (typeof url === "string" && isSafeUrl(url)) {
            window.open(url, "_blank", "noopener,noreferrer");
          }
          break;
        }
        case "widget:error":
          setState("error");
          setErrorMessage(msg.message);
          break;
      }
    },
    [maxHeight, onSendPrompt]
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
    // state를 deps에서 제거 — 타임아웃은 마운트 시 1회만 설정
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      "*" // srcdoc iframe에는 targetOrigin "*" 필수
    );
  }, [data]);

  // 4. 다크/라이트 모드 전환 감지
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow || state !== "ready") return;
      iframe.contentWindow.postMessage(
        { type: "widget:theme-change", theme: extractThemeVarsFromDOM() },
        "*"
      );
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    return () => observer.disconnect();
  }, [state]);

  // 5. srcdoc 조립 (widgetId 기반 캐시)
  let srcdoc: string;
  const cached = srcdocCache.get(widgetId);
  if (cached && committedHtmlRef.current === code) {
    srcdoc = cached;
  } else {
    let sanitizedCode: string;
    try {
      sanitizedCode = sanitizeWidgetCode(code);
    } catch {
      return (
        <div className="my-2 rounded-xl border border-line bg-surface-card overflow-hidden">
          <WidgetErrorFallback
            message="위젯 코드가 보안 정책을 위반해요"
            data={data}
          />
        </div>
      );
    }
    srcdoc = buildSrcdoc(sanitizedCode);
    srcdocCache.set(widgetId, srcdoc);
    committedHtmlRef.current = code;
  }

  // 6. 상태별 렌더링
  return (
    <div
      className="my-2 rounded-xl border border-line bg-surface-card overflow-hidden"
      data-widget-id={widgetId}
    >
      {/* 위젯 헤더 */}
      <div className="flex items-center gap-2 border-b border-line-subtle-alt px-3 py-2">
        <WidgetTypeIcon type={widgetType} />
        <span className="text-xs font-medium text-fg">{title}</span>
        <span className="ml-auto text-[10px] text-fg-tertiary">
          {widgetType}
        </span>
      </div>

      {/* 위젯 본문 */}
      <div className="relative">
        {state === "loading" && <WidgetSkeleton title={title} />}

        {(state === "error" || state === "timeout") && (
          <WidgetErrorFallback message={errorMessage} data={data} />
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
