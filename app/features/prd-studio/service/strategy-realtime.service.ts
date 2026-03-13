/**
 * Strategy Realtime Service — 실시간 전략/GTM 분석.
 *
 * GPT-4.1/Gemini를 사용하여 즉시 결과를 반환하는 경로.
 * 큐 기반(prd_strategy_queue) 경로와 달리, 사용자가 UI에서
 * 즉시 결과를 확인할 수 있도록 동기 호출한다.
 */

import { callLLM } from "~/lib/ai";
import type { FallbackContext } from "~/lib/ai";
import { buildStrategyPrompt, type PrdSectionInput } from "../lib/strategy-prompt";
import { parseStrategyResult, type StrategyResult } from "../lib/strategy-parser";
import { buildGtmPrompt } from "../lib/gtm-prompt";
import { parseGtmResult, type GtmResult } from "../lib/gtm-parser";

export class StrategyRealtimeService {
  /**
   * 실시간 전략 분석 — GPT-4.1/Gemini로 즉시 결과 반환.
   * JSON 응답.
   */
  async analyzeStrategy(
    apiKey: string,
    sections: PrdSectionInput[],
    aiCtx?: FallbackContext,
  ): Promise<StrategyResult> {
    const prompt = buildStrategyPrompt(sections);

    const response = await callLLM(apiKey, {
      model: "gpt-4.1",
      max_tokens: 4000,
      system: "전략 분석 전문가. 반드시 JSON만 출력하세요.",
      messages: [{ role: "user", content: prompt }],
    }, aiCtx);

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join("");

    return parseStrategyResult(text);
  }

  /**
   * 실시간 GTM 분석 — Strategy 결과를 입력으로 사용.
   */
  async analyzeGtm(
    apiKey: string,
    sections: PrdSectionInput[],
    strategy: StrategyResult,
    aiCtx?: FallbackContext,
  ): Promise<GtmResult> {
    const prompt = buildGtmPrompt(sections, strategy);

    const response = await callLLM(apiKey, {
      model: "gpt-4.1",
      max_tokens: 3000,
      system: "GTM 전략 전문가. 반드시 JSON만 출력하세요.",
      messages: [{ role: "user", content: prompt }],
    }, aiCtx);

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join("");

    return parseGtmResult(text);
  }
}
