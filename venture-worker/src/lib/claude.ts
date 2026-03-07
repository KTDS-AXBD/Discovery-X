/**
 * Claude API 클라이언트
 * - Structured output (tool_use 강제)
 * - Retry with exponential backoff
 */

import type { ClaudeResponse, ClaudeToolUseBlock } from "../types";
import { waitWithBackoff } from "@discovery-x/worker-utils";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

interface ClaudeCallOptions {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  maxRetries?: number;
}

/**
 * Claude API 호출 (structured output)
 */
export async function callClaude<T>(
  options: ClaudeCallOptions
): Promise<T> {
  const {
    apiKey,
    model,
    system,
    user,
    schema,
    maxTokens = 8192,
    maxRetries = 3,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: user }],
          tools: [
            {
              name: "output",
              description: "Structured output for the task result",
              input_schema: schema,
            },
          ],
          tool_choice: { type: "tool", name: "output" },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`Claude API error: ${response.status} - ${errorText}`);

        // Non-retryable errors
        if (response.status === 401 || response.status === 403) {
          throw error;
        }
        if (response.status === 400) {
          throw error;
        }

        // Retryable errors (429, 5xx)
        if (response.status === 429 || response.status >= 500) {
          lastError = error;
          await waitWithBackoff(attempt);
          continue;
        }

        throw error;
      }

      const data = (await response.json()) as ClaudeResponse;

      // Find tool_use block
      const toolUseBlock = data.content.find(
        (block): block is ClaudeToolUseBlock => block.type === "tool_use"
      );

      if (!toolUseBlock) {
        throw new Error("No tool_use block in response");
      }

      return toolUseBlock.input as T;
    } catch (error) {
      if (error instanceof Error) {
        // Network errors are retryable
        if (
          error.message.includes("fetch") ||
          error.message.includes("network") ||
          error.message.includes("ETIMEDOUT")
        ) {
          lastError = error;
          await waitWithBackoff(attempt);
          continue;
        }
        throw error;
      }
      throw error;
    }
  }

  throw lastError || new Error("Max retries exceeded");
}
