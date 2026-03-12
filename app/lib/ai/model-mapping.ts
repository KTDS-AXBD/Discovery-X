/**
 * 크로스 프로바이더 모델 매핑.
 * Anthropic 모델 ID를 각 프로바이더 대응 모델로 변환한다.
 */

import type { ProviderId } from "./types";

interface ModelMapping {
  openai: string;
  google: string;
  deepseek: string;
  "workers-ai": string;
}

/**
 * Anthropic 모델 → 타 프로바이더 모델 매핑 테이블.
 * 2026-03 최신: GPT-5.4/4.1 + Gemini 2.5 Pro + DeepSeek V3.2
 */
const MODEL_MAP: Record<string, ModelMapping> = {
  // Sonnet 4 계열 → 고성능 모델
  "claude-sonnet-4-20250514": {
    openai: "gpt-4.1",
    google: "gemini-2.5-pro",
    deepseek: "deepseek-chat",
    "workers-ai": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  },
  // Haiku 계열 → 경량 모델
  "claude-haiku-4-5-20251001": {
    openai: "gpt-4.1-nano",
    google: "gemini-2.5-flash",
    deepseek: "deepseek-chat",
    "workers-ai": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  },
  // Haiku 3.5 (레거시)
  "claude-haiku-3-5-20241022": {
    openai: "gpt-4.1-nano",
    google: "gemini-2.5-flash",
    deepseek: "deepseek-chat",
    "workers-ai": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  },
  // Opus 4 → 최고급 모델
  "claude-opus-4-20250514": {
    openai: "gpt-5.4",
    google: "gemini-2.5-pro",
    deepseek: "deepseek-reasoner",
    "workers-ai": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  },
};

/** 기본 매핑 (매핑 테이블에 없는 모델의 폴백) */
const DEFAULT_MAPPING: ModelMapping = {
  openai: "gpt-4.1",
  google: "gemini-2.5-pro",
  deepseek: "deepseek-chat",
  "workers-ai": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
};

/**
 * Anthropic 모델 ID를 대상 프로바이더의 모델 ID로 변환.
 * PolicyRouter가 선택한 native model (non-Anthropic)은 매핑 없이 그대로 반환.
 */
export function mapModel(model: string, targetProvider: Exclude<ProviderId, "anthropic">): string {
  // Native model → 매핑 건너뛰기 (PolicyRouter degrade 등으로 직접 선택된 모델)
  if (!model.startsWith("claude-")) return model;

  const mapping = MODEL_MAP[model] ?? DEFAULT_MAPPING;
  return mapping[targetProvider];
}
