/**
 * AgentSession Durable Object — 스텁 구현.
 *
 * 현재 Remix Action 기반으로 동작 중이며, DO 이관 시 이 파일을 실제 DO 클래스로 교체.
 * wrangler.toml에 DO 바인딩 추가 필요:
 *   [durable_objects]
 *   bindings = [{ name = "AGENT_SESSION", class_name = "AgentSessionDO" }]
 *
 * Feature Flag: FF_AGENT_DO
 */

export interface AgentDORequest {
  type: "chat" | "end" | "status";
  conversationId?: string;
  message?: string;
  userId: string;
}

export interface AgentDOResponse {
  type: "stream" | "status" | "error";
  data?: unknown;
  error?: string;
}

/**
 * DO 스텁 — 현재는 미구현 에러를 반환.
 * FF_AGENT_DO = "true" 시에만 활성화 예정.
 */
export class AgentSessionDOStub {
  // DO 이관 시 Durable Object의 state/storage 사용
  // constructor(private state: DurableObjectState) {}

  /** DO 이관 시 fetch 핸들러로 교체됨. 현재는 미구현 에러 반환. */
  async handleRequest(_request: AgentDORequest): Promise<AgentDOResponse> {
    return {
      type: "error",
      error:
        "AgentSession DO is not yet implemented. Using Remix Action fallback.",
    };
  }
}

/**
 * DO 사용 가능 여부 확인.
 * FF_AGENT_DO Feature Flag + DO 바인딩 존재 여부로 판단.
 */
export function isAgentDOAvailable(env: Record<string, unknown>): boolean {
  return env.FF_AGENT_DO === "true" && env.AGENT_SESSION !== undefined;
}
