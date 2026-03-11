/**
 * AgentSession Durable Object — PRD v3 §7 구현.
 *
 * 사용자별 싱글톤 DO로 동시성 제어, context 캐시, 토큰 예산 추적.
 * 30분 비활성 시 alarm()으로 메모리 flush + 세션 정리.
 */
import type { Env, SessionState, ChatRequest, SSEEventType } from "./types";

const FLUSH_TIMEOUT_MS = 30 * 60 * 1000; // 30분
const MAX_FLUSH_RETRIES = 3;

const DEFAULT_SOUL_PROMPT = `# Discovery-X Agent — SOUL

## 성격
분석적이고 직설적인 BD(사업개발) 어시스턴트.
불확실한 정보는 솔직히 인정하고, 가정과 사실을 구분한다.

## 원칙
- **데이터 기반**: 주장에는 근거를 제시한다
- **비판적 사고**: 확증 편향을 경계하고 반론을 고려한다
- **한국어 기본**: 자연스러운 한국어로 응답한다
- **행동 지향**: 분석에 그치지 않고 다음 행동을 제안한다
- **간결성**: 불필요한 서론/반복을 피하고 핵심만 전달한다

## 금지 사항
- 자동 의사결정 (Next/Hold/Drop 판단은 사용자 몫)
- 확신 없는 예측이나 추천
- 개인정보 유추
- 외부 시스템 접근 가정

## 응답 형식
- 마크다운(볼드, 리스트, 코드블록) 적극 활용
- 작업 완료 후 다음 단계 1-2개 제안
- 500자 이상 응답은 요약 헤더 포함`;

export class AgentSessionDO implements DurableObject {
  private isProcessing = false;
  private tokenCount = 0;
  private lastActivityAt = Date.now();
  private userId = "";
  private tenantId = "";
  private projectionCache: string | null = null;
  private soulCache: string | null = null;
  private conversationSummary: string | null = null;

  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {
    // DO 재활성화 시 저장된 상태 복원
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<SessionState>("session");
      if (stored) {
        this.userId = stored.userId;
        this.tenantId = stored.tenantId;
        this.tokenCount = stored.tokenCount;
        this.lastActivityAt = stored.lastActivityAt;
        this.projectionCache = stored.projectionCache ?? null;
        this.soulCache = stored.soulCache ?? null;
        this.conversationSummary = stored.conversationSummary ?? null;
      }
    });
  }

  /** HTTP 요청 핸들러 — Worker에서 DO로 포워딩됨 */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // 상태 조회
    if (url.pathname === "/status") {
      return Response.json({
        isProcessing: this.isProcessing,
        tokenCount: this.tokenCount,
        lastActivityAt: this.lastActivityAt,
        userId: this.userId,
      });
    }

    // 채팅 요청
    if (request.method === "POST" && url.pathname === "/chat") {
      return this.handleChatRequest(request);
    }

    return new Response("Not found", { status: 404 });
  }

  /** alarm 핸들러 — 30분 비활성 시 flush + 세션 정리 */
  async alarm(): Promise<void> {
    if (Date.now() - this.lastActivityAt > FLUSH_TIMEOUT_MS) {
      await this.flushMemory();
      await this.state.storage.deleteAll();
      // 인메모리 상태도 리셋
      this.tokenCount = 0;
      this.projectionCache = null;
      this.soulCache = null;
      this.conversationSummary = null;
    }
  }

  // ─── Private Methods ─────────────────────────────────────────────

  /** 채팅 요청 처리 — 동시성 lock + SSE 스트리밍 */
  private async handleChatRequest(request: Request): Promise<Response> {
    // 동시성 제어: 이미 처리 중이면 429 반환
    if (this.isProcessing) {
      return Response.json(
        { error: "다른 탭에서 대화가 진행 중입니다. 잠시 후 다시 시도하세요." },
        { status: 429 },
      );
    }

    this.isProcessing = true;
    this.lastActivityAt = Date.now();

    try {
      const body = (await request.json()) as ChatRequest & {
        userId: string;
        tenantId: string;
      };

      // 세션 초기화 (첫 요청 시)
      if (!this.userId) {
        this.userId = body.userId;
        this.tenantId = body.tenantId;
      }

      const { conversationId, message, mode } = body;

      if (!conversationId || !message?.trim()) {
        return Response.json(
          { error: "conversationId와 message가 필요합니다." },
          { status: 400 },
        );
      }

      // 월간 토큰 예산 체크
      const budgetOk = await this.checkMonthlyBudget();
      if (!budgetOk) {
        return Response.json(
          { error: "월간 토큰 예산을 초과했습니다. 다음 달에 다시 시도하세요." },
          { status: 429 },
        );
      }

      // SSE 스트리밍 응답 생성
      const stream = this.createSSEStream(conversationId, message, mode);

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Internal error" },
        { status: 500 },
      );
    } finally {
      this.isProcessing = false;
      // 비활성 타이머 갱신 — 30분 후 flush
      await this.state.storage.setAlarm(Date.now() + FLUSH_TIMEOUT_MS);
      // 세션 상태 저장
      await this.persistState();
    }
  }

  /** SSE ReadableStream 생성 */
  private createSSEStream(
    conversationId: string,
    message: string,
    mode?: string,
  ): ReadableStream {
    const encoder = new TextEncoder();
    const self = this;

    return new ReadableStream({
      async start(controller) {
        const sendEvent = (type: SSEEventType, data: string) => {
          controller.enqueue(
            encoder.encode(`event: ${type}\ndata: ${data}\n\n`),
          );
        };

        try {
          // LLM API 호출 (Anthropic Claude)
          const response = await fetch(
            "https://api.anthropic.com/v1/messages",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": self.env.ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
              },
              body: JSON.stringify({
                model: "claude-sonnet-4-5-20250514",
                max_tokens: 4096,
                stream: true,
                system: self.buildSystemPrompt(),
                messages: [{ role: "user", content: message }],
              }),
            },
          );

          if (!response.ok) {
            sendEvent("error", JSON.stringify({ error: `LLM API error: ${response.status}` }));
            controller.close();
            return;
          }

          // SSE 파싱 — Anthropic streaming 응답 처리
          const reader = response.body?.getReader();
          if (!reader) {
            sendEvent("error", JSON.stringify({ error: "No response body" }));
            controller.close();
            return;
          }

          const decoder = new TextDecoder();
          let buffer = "";
          let totalTokens = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const event = JSON.parse(data) as Record<string, unknown>;
                const eventType = event.type as string;

                if (eventType === "content_block_delta") {
                  const delta = event.delta as Record<string, unknown>;
                  if (delta.type === "text_delta") {
                    sendEvent("text", JSON.stringify({ text: delta.text }));
                  }
                }

                if (eventType === "message_delta") {
                  const usage = event.usage as Record<string, number> | undefined;
                  if (usage?.output_tokens) {
                    totalTokens += usage.output_tokens;
                  }
                }
              } catch {
                // JSON 파싱 실패 — 무시
              }
            }
          }

          // 토큰 카운트 갱신
          self.tokenCount += totalTokens;

          // 대화 요약 누적 (사용자 메시지 앞부분만 기록)
          self.conversationSummary = (self.conversationSummary ?? "")
            + `\n[${new Date().toISOString()}] user: ${message.slice(0, 100)}`;

          sendEvent("done", JSON.stringify({
            conversationId,
            mode: mode ?? "default",
            tokensUsed: totalTokens,
          }));
        } catch (err) {
          sendEvent(
            "error",
            JSON.stringify({ error: err instanceof Error ? err.message : "Stream error" }),
          );
        } finally {
          controller.close();
        }
      },
    });
  }

  /** 월간 토큰 예산 상수 (200만 토큰) */
  private static readonly MONTHLY_LLM_BUDGET = 2_000_000;

  /** 월간 토큰 사용량을 D1에서 조회하여 예산 초과 여부 확인 */
  private async checkMonthlyBudget(): Promise<boolean> {
    try {
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const monthStartEpoch = Math.floor(monthStart.getTime() / 1000);

      const stmt = this.env.DB.prepare(`
        SELECT coalesce(sum(input_tokens + output_tokens), 0) as total
        FROM usage_events
        WHERE user_id = ? AND created_at >= ?
      `);
      const result = await stmt.bind(this.userId, monthStartEpoch).first<{ total: number }>();
      return (result?.total ?? 0) < AgentSessionDO.MONTHLY_LLM_BUDGET;
    } catch {
      // 예산 체크 실패 시 허용 (fail-open)
      return true;
    }
  }

  /** 시스템 프롬프트 조립 — SoulEngine 레이어링 (SOUL → USER Projection) */
  private buildSystemPrompt(): string {
    const sections: string[] = [];

    // 1. Base SOUL (soulCache가 있으면 사용, 없으면 기본 템플릿)
    if (this.soulCache) {
      sections.push(this.soulCache);
    } else {
      sections.push(DEFAULT_SOUL_PROMPT);
    }

    // 2. USER.md Projection (사용자 프로필)
    if (this.projectionCache) {
      sections.push(`## 사용자 프로파일\n${this.projectionCache}`);
    }

    return sections.join("\n\n---\n\n");
  }

  /** 메모리 flush — DO 정리 전 대화 요약을 DB에 저장 */
  private async flushMemory(): Promise<void> {
    let retries = 0;
    while (retries < MAX_FLUSH_RETRIES) {
      try {
        // D1에 세션 통계 + 대화 요약 기록
        const stmt = this.env.DB.prepare(
          "UPDATE agent_sessions_v2 SET token_count = ?, conversation_summary = ?, updated_at = ? WHERE user_id = ? AND status = 'active'",
        );
        await stmt.bind(
          this.tokenCount,
          this.conversationSummary ?? null,
          Math.floor(Date.now() / 1000),
          this.userId,
        ).run();
        return;
      } catch {
        retries++;
        if (retries >= MAX_FLUSH_RETRIES) {
          console.error(`[AgentSessionDO] flush 실패 (${MAX_FLUSH_RETRIES}회 재시도 초과): userId=${this.userId}`);
        }
        // 짧은 대기 후 재시도
        await new Promise((r) => setTimeout(r, 1000 * retries));
      }
    }
  }

  /** 세션 상태를 DO storage에 저장 */
  private async persistState(): Promise<void> {
    const state: SessionState = {
      userId: this.userId,
      tenantId: this.tenantId,
      tokenCount: this.tokenCount,
      lastActivityAt: this.lastActivityAt,
      projectionCache: this.projectionCache ?? undefined,
      soulCache: this.soulCache ?? undefined,
      conversationSummary: this.conversationSummary ?? undefined,
    };
    await this.state.storage.put("session", state);
  }
}
