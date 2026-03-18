/**
 * Widget tool handlers — Generative UI (F48)
 * render_widget: sanitize → DB 저장 → 결과 반환 패스스루 도구.
 */

import type { DB } from "~/db";
import { chatWidgets } from "~/db";
import { sanitizeWidgetCodeDetailed } from "~/features/chat/lib/widget-sanitizer";
import type { WidgetType } from "~/features/chat/lib/widget-protocol";

interface RenderWidgetInput {
  widgetType: string;
  title: string;
  code: string;
  data: Record<string, unknown>;
  description?: string;
  /** agent-pipeline에서 자동 주입 */
  _conversationId?: string;
  /** agent-pipeline에서 자동 주입 */
  _tenantId?: string;
}

/**
 * render_widget 도구 핸들러.
 * sanitize → DB 저장 → {widgetId, widgetType, title, code, data, warnings} 반환.
 */
export async function renderWidget(
  db: DB,
  input: RenderWidgetInput,
): Promise<string> {
  const { widgetType, title, code, data, description, _conversationId, _tenantId } = input;

  if (!widgetType || !title || !code) {
    return JSON.stringify({
      error: "render_widget: widgetType, title, code 필드가 필요합니다",
    });
  }

  // 1. 코드 sanitize
  const sanitizeResult = sanitizeWidgetCodeDetailed(code);
  if (sanitizeResult.blocked) {
    return JSON.stringify({
      error: "위젯 코드가 보안 정책을 위반합니다",
      warnings: sanitizeResult.warnings,
    });
  }

  const widgetId = crypto.randomUUID();

  // 2. DB 저장 (conversationId가 있을 때만 — 위젯 캐시용)
  if (_conversationId) {
    try {
      await db.insert(chatWidgets).values({
        id: widgetId,
        conversationId: _conversationId,
        widgetType: widgetType as WidgetType,
        title,
        code: sanitizeResult.code,
        data: data ?? {},
        description: description ?? null,
        tenantId: _tenantId ?? null,
      });
    } catch {
      // DB 저장 실패는 비치명적 — 렌더링은 계속 진행
    }
  }

  // 3. 결과 반환 (ChatPanel이 tool_call 이벤트에서 WidgetRenderer로 변환)
  return JSON.stringify({
    widgetId,
    widgetType,
    title,
    code: sanitizeResult.code,
    data: data ?? {},
    description: description ?? null,
    warnings: sanitizeResult.warnings,
  });
}
