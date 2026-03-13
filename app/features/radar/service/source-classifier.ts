/**
 * SourceClassifier — LLM 기반 소스 분류 추천 서비스
 *
 * 미분류 소스를 기존 도메인/폴더 목록과 대조하여 분류 추천.
 * 5건씩 배치 호출로 토큰 효율 확보.
 *
 * @see ItemEvaluator (동일 패턴 — LLM 호출 + 비용 추적)
 */

import type { DB } from "~/db";
import { callLLM, BudgetBlockedError } from "~/lib/ai";
import type { FallbackContext, ClaudeResponse } from "~/lib/ai";
import { UsageRecorder } from "~/features/cost/service/usage-recorder";
import type { ProviderId } from "~/features/cost/types";

// ============================================================================
// Types
// ============================================================================

export interface UnclassifiedSource {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  sourceType: string;
  keywords: string[] | null;
  radarTags: string[] | null;
}

export interface DomainInfo {
  id: string;
  name: string;
}

export interface FolderInfo {
  id: string;
  name: string;
}

export interface ClassificationSuggestion {
  sourceId: string;
  suggestedDomainIds: string[];
  suggestedFolderName: string | null;
  confidence: number;
  reasoning: string;
}

export interface ClassifyBatchResult {
  suggestions: ClassificationSuggestion[];
  errors: string[];
  budgetBlocked: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const BATCH_SIZE = 5;
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1024;

const CLASSIFY_SYSTEM_PROMPT = `당신은 기술 트렌드 레이더 소스 분류 전문가입니다.
주어진 소스 목록을 기존 도메인과 폴더에 분류해주세요.

규칙:
- domainIds: 기존 도메인 ID 중 1~2개 선택 (반드시 제공된 ID만 사용)
- folderName: 기존 폴더 이름 사용 또는 새 이름 제안 (해당 없으면 null)
- confidence: 0.0~1.0 (확신도)
- reasoning: 분류 근거 (한국어, 1~2문장)

JSON 배열만 반환하세요:
[{"sourceId":"...","domainIds":["..."],"folderName":"...","confidence":0.00,"reasoning":"..."}]`;

// ============================================================================
// Service
// ============================================================================

export class SourceClassifier {
  constructor(private db: DB) {}

  /**
   * LLM 응답 텍스트 → ClassificationSuggestion[] 파싱 + 검증
   */
  parseClassifyResponse(text: string): ClassificationSuggestion[] | null {
    const cleaned = text
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    try {
      const parsed = JSON.parse(cleaned);

      if (!Array.isArray(parsed)) return null;

      const suggestions: ClassificationSuggestion[] = [];

      for (const item of parsed) {
        if (
          typeof item.sourceId !== "string" ||
          !Array.isArray(item.domainIds) ||
          typeof item.confidence !== "number" ||
          typeof item.reasoning !== "string"
        ) {
          continue;
        }

        suggestions.push({
          sourceId: item.sourceId,
          suggestedDomainIds: item.domainIds.filter(
            (id: unknown) => typeof id === "string",
          ),
          suggestedFolderName:
            typeof item.folderName === "string" ? item.folderName : null,
          confidence: clamp(item.confidence),
          reasoning: item.reasoning,
        });
      }

      return suggestions.length > 0 ? suggestions : null;
    } catch {
      return null;
    }
  }

  /**
   * 분류 프롬프트 생성
   */
  buildClassifyPrompt(
    sources: UnclassifiedSource[],
    domains: DomainInfo[],
    folders: FolderInfo[],
  ): string {
    const domainList = domains
      .map((d) => `- ${d.id}: ${d.name}`)
      .join("\n");

    const folderList =
      folders.length > 0
        ? folders.map((f) => `- ${f.id}: ${f.name}`).join("\n")
        : "없음";

    const sourceList = sources
      .map((s) => {
        const parts = [
          `sourceId: ${s.sourceId}`,
          `name: ${s.sourceName}`,
          `url: ${s.sourceUrl}`,
          `type: ${s.sourceType}`,
        ];
        if (s.keywords?.length) parts.push(`keywords: ${s.keywords.join(", ")}`);
        if (s.radarTags?.length) parts.push(`tags: ${s.radarTags.join(", ")}`);
        return `{ ${parts.join(", ")} }`;
      })
      .join("\n");

    return `[기존 도메인]\n${domainList}\n\n[기존 폴더]\n${folderList}\n\n[분류 대상 소스]\n${sourceList}`;
  }

  /**
   * 배치 분류 실행 — 5건씩 묶어서 LLM 호출
   */
  async classifyBatch(params: {
    sources: UnclassifiedSource[];
    domains: DomainInfo[];
    folders: FolderInfo[];
    env: Record<string, string | undefined>;
    tenantId: string;
  }): Promise<ClassifyBatchResult> {
    const { sources, domains, folders, env, tenantId } = params;

    const result: ClassifyBatchResult = {
      suggestions: [],
      errors: [],
      budgetBlocked: false,
    };

    if (sources.length === 0) return result;

    const apiKey = env.ANTHROPIC_API_KEY ?? "";

    for (let i = 0; i < sources.length; i += BATCH_SIZE) {
      const batch = sources.slice(i, i + BATCH_SIZE);

      try {
        const content = this.buildClassifyPrompt(batch, domains, folders);

        const ctx: FallbackContext = {
          env,
          db: this.db,
          userId: "system",
          tenantId,
          purpose: "eval",
        };

        const response = await callLLM(
          apiKey,
          {
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: CLASSIFY_SYSTEM_PROMPT,
            messages: [{ role: "user", content }],
          },
          ctx,
        );

        // 비용 추적
        await this.recordUsage(response, tenantId);

        // 응답 파싱
        const firstBlock = response.content?.[0];
        const responseText =
          firstBlock?.type === "text" ? (firstBlock.text ?? "") : "";
        const suggestions = this.parseClassifyResponse(responseText);

        if (!suggestions) {
          result.errors.push(
            `배치 ${i / BATCH_SIZE + 1}: JSON 파싱 실패`,
          );
          continue;
        }

        result.suggestions.push(...suggestions);
      } catch (err) {
        if (err instanceof BudgetBlockedError) {
          result.budgetBlocked = true;
          result.errors.push("예산 초과 — 배치 중단");
          break;
        }

        result.errors.push(
          `배치 ${i / BATCH_SIZE + 1}: ${err instanceof Error ? err.message : "unknown"}`,
        );
      }
    }

    return result;
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private async recordUsage(
    response: ClaudeResponse,
    tenantId: string,
  ): Promise<void> {
    try {
      const provider =
        ((response as unknown as Record<string, unknown>)._provider as ProviderId) ??
        "anthropic";

      await new UsageRecorder(this.db).record({
        userId: "system",
        tenantId,
        provider,
        model: response.model ?? MODEL,
        purpose: "eval" as const,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      });
    } catch (err) {
      console.warn("[SourceClassifier] usage recording failed:", err);
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function clamp(v: number): number {
  return Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
}
