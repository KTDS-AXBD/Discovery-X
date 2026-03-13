/**
 * SourceClassifier 단위 테스트
 *
 * 대상: app/features/radar/service/source-classifier.ts
 * - parseClassifyResponse: JSON 파싱 + 검증 + clamp
 * - buildClassifyPrompt: 프롬프트 생성
 * - classifyBatch: LLM 모킹 배치 분류
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { DB } from "~/db";

// ─── Top-level mocks ────────────────────────────────────────────────────

const { mockCallLLM, mockRecord } = vi.hoisted(() => ({
  mockCallLLM: vi.fn(),
  mockRecord: vi.fn().mockResolvedValue({ usageEventId: "test-id", totalCostUsd: 0 }),
}));

vi.mock("~/lib/ai", () => {
  class BudgetBlockedError extends Error {
    name = "BudgetBlockedError";
    constructor(public readonly decisionId: string) {
      super("예산 한도 초과로 LLM 호출이 차단되었습니다");
    }
  }
  return { callLLM: mockCallLLM, BudgetBlockedError };
});

vi.mock("~/features/cost/service/usage-recorder", () => ({
  UsageRecorder: class {
    record = mockRecord;
  },
}));

// import after mocks are set up
import {
  SourceClassifier,
  type UnclassifiedSource,
  type DomainInfo,
  type FolderInfo,
  type ClassificationSuggestion,
} from "~/features/radar/service/source-classifier";

// ─── 상수 ───────────────────────────────────────────────────────────────

const TENANT_ID = "t-classify-test";

// ─── Helpers ────────────────────────────────────────────────────────────

function makeLLMResponse(
  suggestions: Array<{
    sourceId: string;
    domainIds: string[];
    folderName: string | null;
    confidence: number;
    reasoning: string;
  }>,
) {
  return {
    model: "claude-haiku-4-5-20251001",
    content: [{ type: "text" as const, text: JSON.stringify(suggestions) }],
    usage: { input_tokens: 200, output_tokens: 100 },
  };
}

function makeSource(id: string, overrides: Partial<UnclassifiedSource> = {}): UnclassifiedSource {
  return {
    sourceId: id,
    sourceName: `Source ${id}`,
    sourceUrl: `https://${id}.example.com`,
    sourceType: "rss",
    keywords: null,
    radarTags: null,
    ...overrides,
  };
}

// ─── Setup ──────────────────────────────────────────────────────────────

let classifier: SourceClassifier;

beforeEach(() => {
  classifier = new SourceClassifier({} as unknown as DB);
  mockCallLLM.mockReset();
  mockRecord.mockReset().mockResolvedValue({ usageEventId: "test-id", totalCostUsd: 0 });
});

// ─── Tests ──────────────────────────────────────────────────────────────

describe("SourceClassifier", () => {
  // ══════════════════════════════════════════════
  // parseClassifyResponse
  // ══════════════════════════════════════════════
  describe("parseClassifyResponse", () => {
    it("정상 JSON 배열 파싱", () => {
      const input = JSON.stringify([
        {
          sourceId: "s1",
          domainIds: ["d1"],
          folderName: "뉴스",
          confidence: 0.85,
          reasoning: "AI 관련 뉴스 소스",
        },
      ]);

      const result = classifier.parseClassifyResponse(input);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].sourceId).toBe("s1");
      expect(result![0].suggestedDomainIds).toEqual(["d1"]);
      expect(result![0].suggestedFolderName).toBe("뉴스");
      expect(result![0].confidence).toBe(0.85);
      expect(result![0].reasoning).toBe("AI 관련 뉴스 소스");
    });

    it("markdown 코드블록 래핑 처리", () => {
      const inner = JSON.stringify([
        { sourceId: "s1", domainIds: ["d1"], folderName: null, confidence: 0.9, reasoning: "테스트" },
      ]);
      const input = `\`\`\`json\n${inner}\n\`\`\``;

      const result = classifier.parseClassifyResponse(input);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].sourceId).toBe("s1");
    });

    it("잘못된 JSON → null", () => {
      expect(classifier.parseClassifyResponse("not json")).toBeNull();
    });

    it("배열 아닌 객체 → null", () => {
      const input = JSON.stringify({
        sourceId: "s1",
        domainIds: ["d1"],
        folderName: null,
        confidence: 0.8,
        reasoning: "단일 객체",
      });

      expect(classifier.parseClassifyResponse(input)).toBeNull();
    });

    it("confidence 범위 clamp", () => {
      const input = JSON.stringify([
        { sourceId: "s1", domainIds: ["d1"], folderName: null, confidence: 1.5, reasoning: "높음" },
        { sourceId: "s2", domainIds: ["d2"], folderName: null, confidence: -0.3, reasoning: "낮음" },
      ]);

      const result = classifier.parseClassifyResponse(input);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(2);
      expect(result![0].confidence).toBe(1.0);
      expect(result![1].confidence).toBe(0.0);
    });

    it("필드 누락 항목 skip", () => {
      const input = JSON.stringify([
        { sourceId: "s1", domainIds: ["d1"], folderName: null, confidence: 0.8, reasoning: "유효" },
        { sourceId: "s2" }, // domainIds, confidence, reasoning 누락
      ]);

      const result = classifier.parseClassifyResponse(input);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].sourceId).toBe("s1");
    });

    it("빈 배열 → null", () => {
      expect(classifier.parseClassifyResponse("[]")).toBeNull();
    });
  });

  // ══════════════════════════════════════════════
  // buildClassifyPrompt
  // ══════════════════════════════════════════════
  describe("buildClassifyPrompt", () => {
    it("도메인 목록 포함", () => {
      const domains: DomainInfo[] = [{ id: "d1", name: "AI/ML" }];
      const result = classifier.buildClassifyPrompt(
        [makeSource("s1")],
        domains,
        [],
      );

      expect(result).toContain("d1: AI/ML");
    });

    it("폴더 없으면 '없음' 표시", () => {
      const result = classifier.buildClassifyPrompt(
        [makeSource("s1")],
        [{ id: "d1", name: "AI" }],
        [],
      );

      expect(result).toContain("없음");
    });

    it("소스 메타데이터 포함", () => {
      const sources = [makeSource("s1", { sourceName: "TechCrunch" })];
      const result = classifier.buildClassifyPrompt(
        sources,
        [{ id: "d1", name: "AI" }],
        [],
      );

      expect(result).toContain("TechCrunch");
      expect(result).toContain("s1");
    });

    it("keywords/tags 포함", () => {
      const sources = [
        makeSource("s1", {
          keywords: ["AI", "startup"],
          radarTags: ["tech", "trend"],
        }),
      ];

      const result = classifier.buildClassifyPrompt(
        sources,
        [{ id: "d1", name: "AI" }],
        [],
      );

      expect(result).toContain("AI, startup");
      expect(result).toContain("tech, trend");
    });
  });

  // ══════════════════════════════════════════════
  // classifyBatch
  // ══════════════════════════════════════════════
  describe("classifyBatch", () => {
    const defaultParams = {
      domains: [{ id: "d1", name: "AI" }] as DomainInfo[],
      folders: [] as FolderInfo[],
      env: { ANTHROPIC_API_KEY: "test-key" },
      tenantId: TENANT_ID,
    };

    it("빈 배치 — sources 없으면 즉시 반환", async () => {
      const result = await classifier.classifyBatch({
        ...defaultParams,
        sources: [],
      });

      expect(result.suggestions).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.budgetBlocked).toBe(false);
      expect(mockCallLLM).not.toHaveBeenCalled();
    });

    it("LLM 호출 성공 → suggestions 반환", async () => {
      const sources = [makeSource("s1"), makeSource("s2")];

      mockCallLLM.mockResolvedValue(
        makeLLMResponse([
          { sourceId: "s1", domainIds: ["d1"], folderName: "뉴스", confidence: 0.9, reasoning: "AI 뉴스" },
          { sourceId: "s2", domainIds: ["d1"], folderName: null, confidence: 0.7, reasoning: "기술 블로그" },
        ]),
      );

      const result = await classifier.classifyBatch({
        ...defaultParams,
        sources,
      });

      expect(result.suggestions).toHaveLength(2);
      expect(result.suggestions[0].sourceId).toBe("s1");
      expect(result.suggestions[1].sourceId).toBe("s2");
      expect(result.errors).toHaveLength(0);
      expect(mockCallLLM).toHaveBeenCalledTimes(1); // 2건 < BATCH_SIZE(5)이므로 1회
    });

    it("LLM 부분 실패 — errors에 추가, 다음 배치 진행", async () => {
      // 6건 → 배치 2개 (5+1)
      const sources = Array.from({ length: 6 }, (_, i) => makeSource(`s${i}`));

      let callCount = 0;
      mockCallLLM.mockImplementation(() => {
        callCount++;
        if (callCount === 1) throw new Error("LLM call failed");
        return makeLLMResponse([
          { sourceId: "s5", domainIds: ["d1"], folderName: null, confidence: 0.8, reasoning: "성공" },
        ]);
      });

      const result = await classifier.classifyBatch({
        ...defaultParams,
        sources,
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("배치 1");
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].sourceId).toBe("s5");
    });

    it("BudgetBlockedError → 즉시 중단", async () => {
      const sources = [makeSource("s1"), makeSource("s2")];

      const { BudgetBlockedError } = await import("~/lib/ai");
      mockCallLLM.mockRejectedValue(new BudgetBlockedError("dec-1"));

      const result = await classifier.classifyBatch({
        ...defaultParams,
        sources,
      });

      expect(result.budgetBlocked).toBe(true);
      expect(result.suggestions).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("예산 초과");
      expect(mockCallLLM).toHaveBeenCalledTimes(1);
    });

    it("JSON 파싱 실패 → errors에 추가", async () => {
      const sources = [makeSource("s1")];

      mockCallLLM.mockResolvedValue({
        model: "claude-haiku-4-5-20251001",
        content: [{ type: "text", text: "invalid response" }],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      const result = await classifier.classifyBatch({
        ...defaultParams,
        sources,
      });

      expect(result.suggestions).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("파싱 실패");
    });
  });
});
