import { describe, it, expect, vi, beforeEach } from "vitest";
import { AmbiguityScorer } from "~/features/prd-studio/lib/ambiguity-scorer";

// callLLM 모킹
vi.mock("~/lib/ai", () => ({
  callLLM: vi.fn(),
}));

import { callLLM } from "~/lib/ai";

const mockCallLLM = vi.mocked(callLLM);

// 헬퍼: LLM 응답 빌더
function makeLLMResponse(dimensions: Record<string, { score: number; rationale?: string; weakPoints?: string[]; suggestedQuestions?: string[] }>) {
  const json = JSON.stringify({ dimensions });
  return {
    content: [{ type: "text" as const, text: json }],
  };
}

describe("AmbiguityScorer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── detectProjectType ──────────────────────────────────────────

  describe("detectProjectType", () => {
    it("background 없으면 greenfield 반환", () => {
      const scorer = new AmbiguityScorer();
      const result = scorer.detectProjectType([
        { type: "summary", answer: "새 프로젝트예요" },
        { type: "objectives", answer: "목표를 설정해요" },
      ]);
      expect(result).toBe("greenfield");
    });

    it("background에 brownfield 키워드 2개 이상이면 brownfield", () => {
      const scorer = new AmbiguityScorer();
      const result = scorer.detectProjectType([
        { type: "background", answer: "기존 레거시 시스템을 마이그레이션해야 해요" },
      ]);
      expect(result).toBe("brownfield");
    });

    it("background에 brownfield 키워드 1개면 greenfield", () => {
      const scorer = new AmbiguityScorer();
      const result = scorer.detectProjectType([
        { type: "background", answer: "기존 문제를 해결하는 완전히 새로운 접근이에요" },
      ]);
      expect(result).toBe("greenfield");
    });

    it("background answer가 비어있으면 greenfield", () => {
      const scorer = new AmbiguityScorer();
      const result = scorer.detectProjectType([
        { type: "background", answer: "" },
      ]);
      expect(result).toBe("greenfield");
    });
  });

  // ── evaluate (전체 평가) ────────────────────────────────────────

  describe("evaluate", () => {
    it("greenfield 프로젝트 — 3차원 평가 + context N/A 추가", async () => {
      mockCallLLM.mockResolvedValueOnce(makeLLMResponse({
        goal: { score: 0.8, rationale: "명확", weakPoints: [], suggestedQuestions: [] },
        constraint: { score: 0.7, rationale: "대체로 명확", weakPoints: ["비용 미명시"], suggestedQuestions: ["예산은?"] },
        success: { score: 0.6, rationale: "보통", weakPoints: ["KPI 부재"], suggestedQuestions: ["성공 지표는?"] },
      }) as never);

      const scorer = new AmbiguityScorer();
      const result = await scorer.evaluate("test-key", [
        { type: "summary", answer: "새 프로젝트" },
        { type: "objectives", answer: "매출 증대" },
        { type: "requirements", answer: "기능 A, B" },
      ]);

      expect(result.projectType).toBe("greenfield");
      expect(result.dimensions).toHaveLength(4); // 3차원 + context(N/A)
      expect(result.dimensions.find((d) => d.dimension === "context")?.score).toBe(0);
      expect(result.clarityPercent).toBeGreaterThan(0);
      expect(result.ambiguityScore).toBeGreaterThanOrEqual(0);
      expect(result.ambiguityScore).toBeLessThanOrEqual(1);
      expect(result.evaluatedAt).toBeGreaterThan(0);
    });

    it("brownfield 프로젝트 — 4차원 평가 모두 포함", async () => {
      mockCallLLM.mockResolvedValueOnce(makeLLMResponse({
        goal: { score: 0.9, rationale: "매우 명확", weakPoints: [], suggestedQuestions: [] },
        constraint: { score: 0.8, rationale: "명확", weakPoints: [], suggestedQuestions: [] },
        success: { score: 0.7, rationale: "대체로 명확", weakPoints: [], suggestedQuestions: [] },
        context: { score: 0.6, rationale: "보통", weakPoints: ["아키텍처 미설명"], suggestedQuestions: ["현재 아키텍처는?"] },
      }) as never);

      const scorer = new AmbiguityScorer();
      const result = await scorer.evaluate("test-key", [
        { type: "background", answer: "기존 레거시 시스템을 마이그레이션하고 리팩토링해요" },
        { type: "summary", answer: "시스템 개선" },
        { type: "objectives", answer: "성능 50% 향상" },
      ]);

      expect(result.projectType).toBe("brownfield");
      expect(result.dimensions).toHaveLength(4);
      const ctxDim = result.dimensions.find((d) => d.dimension === "context");
      expect(ctxDim?.score).toBe(0.6);
      expect(ctxDim?.weakPoints).toContain("아키텍처 미설명");
    });
  });

  // ── 가중치 계산 검증 ──────────────────────────────────────────

  describe("weighted score computation", () => {
    it("greenfield 가중치: goal=0.4, constraint=0.3, success=0.3, context=0", async () => {
      // 모든 차원이 1.0이면 clarity=100%, ambiguity=0
      mockCallLLM.mockResolvedValueOnce(makeLLMResponse({
        goal: { score: 1.0, rationale: "완벽", weakPoints: [], suggestedQuestions: [] },
        constraint: { score: 1.0, rationale: "완벽", weakPoints: [], suggestedQuestions: [] },
        success: { score: 1.0, rationale: "완벽", weakPoints: [], suggestedQuestions: [] },
      }) as never);

      const scorer = new AmbiguityScorer();
      const result = await scorer.evaluate("test-key", [
        { type: "summary", answer: "테스트" },
      ]);

      // 가중합 = (1.0*0.4 + 1.0*0.3 + 1.0*0.3) / (0.4+0.3+0.3) = 1.0
      expect(result.clarityPercent).toBe(100);
      expect(result.ambiguityScore).toBe(0);
      expect(result.gateStatus).toBe("pass");
    });

    it("낮은 점수면 block 상태 반환", async () => {
      mockCallLLM.mockResolvedValueOnce(makeLLMResponse({
        goal: { score: 0.2, rationale: "모호", weakPoints: ["전부"], suggestedQuestions: ["뭐?"] },
        constraint: { score: 0.3, rationale: "모호", weakPoints: ["전부"], suggestedQuestions: ["뭐?"] },
        success: { score: 0.1, rationale: "매우 모호", weakPoints: ["전부"], suggestedQuestions: ["뭐?"] },
      }) as never);

      const scorer = new AmbiguityScorer();
      const result = await scorer.evaluate("test-key", [
        { type: "summary", answer: "뭔가" },
      ]);

      // 가중합 = (0.2*0.4 + 0.3*0.3 + 0.1*0.3) / 1.0 = 0.08+0.09+0.03 = 0.20
      // ambiguity = 1 - 0.20 = 0.80 → block (> 0.4)
      expect(result.gateStatus).toBe("block");
      expect(result.ambiguityScore).toBeGreaterThan(0.4);
    });
  });

  // ── gate status ──────────────────────────────────────────────

  describe("gate status thresholds", () => {
    it("ambiguity <= 0.2 → pass", async () => {
      mockCallLLM.mockResolvedValueOnce(makeLLMResponse({
        goal: { score: 0.9, rationale: "좋음", weakPoints: [], suggestedQuestions: [] },
        constraint: { score: 0.85, rationale: "좋음", weakPoints: [], suggestedQuestions: [] },
        success: { score: 0.8, rationale: "좋음", weakPoints: [], suggestedQuestions: [] },
      }) as never);

      const scorer = new AmbiguityScorer();
      const result = await scorer.evaluate("test-key", [{ type: "summary", answer: "명확한 프로젝트" }]);

      // 가중합 = (0.9*0.4 + 0.85*0.3 + 0.8*0.3) / 1.0 = 0.36+0.255+0.24 = 0.855
      // ambiguity = 0.145 → pass
      expect(result.gateStatus).toBe("pass");
    });

    it("0.2 < ambiguity <= 0.4 → warn", async () => {
      mockCallLLM.mockResolvedValueOnce(makeLLMResponse({
        goal: { score: 0.7, rationale: "보통", weakPoints: [], suggestedQuestions: [] },
        constraint: { score: 0.6, rationale: "보통", weakPoints: [], suggestedQuestions: [] },
        success: { score: 0.6, rationale: "보통", weakPoints: [], suggestedQuestions: [] },
      }) as never);

      const scorer = new AmbiguityScorer();
      const result = await scorer.evaluate("test-key", [{ type: "summary", answer: "보통 프로젝트" }]);

      // 가중합 = (0.7*0.4 + 0.6*0.3 + 0.6*0.3) / 1.0 = 0.28+0.18+0.18 = 0.64
      // ambiguity = 0.36 → warn
      expect(result.gateStatus).toBe("warn");
    });
  });

  // ── LLM 응답 파싱 (markdown fence 포함) ──────────────────────

  describe("response parsing edge cases", () => {
    it("markdown code fence 감싸진 JSON도 파싱 가능", async () => {
      const jsonStr = JSON.stringify({
        dimensions: {
          goal: { score: 0.75, rationale: "OK", weakPoints: [], suggestedQuestions: [] },
          constraint: { score: 0.65, rationale: "OK", weakPoints: [], suggestedQuestions: [] },
          success: { score: 0.55, rationale: "보통", weakPoints: ["미비"], suggestedQuestions: ["보충?"] },
        },
      });
      const fenced = "```json\n" + jsonStr + "\n```";

      mockCallLLM.mockResolvedValueOnce({
        content: [{ type: "text" as const, text: fenced }],
      } as never);

      const scorer = new AmbiguityScorer();
      const result = await scorer.evaluate("test-key", [{ type: "summary", answer: "테스트" }]);

      expect(result.dimensions.find((d) => d.dimension === "goal")?.score).toBe(0.75);
      expect(result.dimensions.find((d) => d.dimension === "success")?.weakPoints).toContain("미비");
    });

    it("LLM이 잘못된 JSON 반환 시 score 0 + 평가 실패 처리", async () => {
      mockCallLLM.mockResolvedValueOnce({
        content: [{ type: "text" as const, text: "이건 JSON이 아닌 텍스트예요" }],
      } as never);

      const scorer = new AmbiguityScorer();
      const result = await scorer.evaluate("test-key", [{ type: "summary", answer: "테스트" }]);

      // parseResponse가 fallback으로 score 0 반환
      for (const dim of result.dimensions) {
        if (dim.dimension !== "context") {
          expect(dim.score).toBe(0);
          expect(dim.rationale).toBe("평가 실패");
        }
      }
      expect(result.gateStatus).toBe("block");
    });
  });

  // ── evaluatePartial (부분 재평가) ──────────────────────────────

  describe("evaluatePartial", () => {
    it("변경된 섹션의 차원만 업데이트하고 나머지는 유지", async () => {
      // 부분 재평가: objectives 변경 → goal, success 차원만 재평가
      mockCallLLM.mockResolvedValueOnce(makeLLMResponse({
        goal: { score: 0.9, rationale: "개선됨", weakPoints: [], suggestedQuestions: [] },
        success: { score: 0.85, rationale: "개선됨", weakPoints: [], suggestedQuestions: [] },
      }) as never);

      const scorer = new AmbiguityScorer();
      const existingDimensions = [
        { dimension: "goal" as const, score: 0.5, rationale: "이전", weakPoints: [], suggestedQuestions: [] },
        { dimension: "constraint" as const, score: 0.7, rationale: "유지", weakPoints: [], suggestedQuestions: [] },
        { dimension: "success" as const, score: 0.4, rationale: "이전", weakPoints: [], suggestedQuestions: [] },
        { dimension: "context" as const, score: 0, rationale: "Greenfield 프로젝트 — 맥락 차원 미적용", weakPoints: [], suggestedQuestions: [] },
      ];

      const result = await scorer.evaluatePartial(
        "test-key",
        [
          { type: "summary", answer: "명확한 요약" },
          { type: "objectives", answer: "구체적 목표와 KPI 포함" },
          { type: "requirements", answer: "기능 목록" },
        ],
        "objectives",
        existingDimensions,
      );

      // goal, success는 업데이트, constraint는 기존값 유지
      expect(result.dimensions.find((d) => d.dimension === "goal")?.score).toBe(0.9);
      expect(result.dimensions.find((d) => d.dimension === "success")?.score).toBe(0.85);
      expect(result.dimensions.find((d) => d.dimension === "constraint")?.score).toBe(0.7);
      expect(result.dimensions.find((d) => d.dimension === "constraint")?.rationale).toBe("유지");
    });
  });

  // ── edge cases ──────────────────────────────────────────────────

  describe("edge cases", () => {
    it("모든 섹션이 빈 답변이면 모든 차원 score 0 + block", async () => {
      mockCallLLM.mockResolvedValueOnce(makeLLMResponse({
        goal: { score: 0.0, rationale: "답변 없음", weakPoints: ["모두 비어있음"], suggestedQuestions: ["프로젝트 목표는?"] },
        constraint: { score: 0.0, rationale: "답변 없음", weakPoints: ["모두 비어있음"], suggestedQuestions: ["제약 조건은?"] },
        success: { score: 0.0, rationale: "답변 없음", weakPoints: ["모두 비어있음"], suggestedQuestions: ["성공 기준은?"] },
      }) as never);

      const scorer = new AmbiguityScorer();
      const result = await scorer.evaluate("test-key", [
        { type: "summary", answer: "" },
        { type: "objectives", answer: "" },
        { type: "requirements", answer: "" },
      ]);

      expect(result.ambiguityScore).toBe(1); // clarity 0 → ambiguity 1
      expect(result.clarityPercent).toBe(0);
      expect(result.gateStatus).toBe("block");
      for (const dim of result.dimensions) {
        if (dim.dimension !== "context") {
          expect(dim.score).toBe(0);
        }
      }
    });

    it("모든 차원 1.0이면 ambiguity 0, pass", async () => {
      mockCallLLM.mockResolvedValueOnce(makeLLMResponse({
        goal: { score: 1.0, rationale: "완벽", weakPoints: [], suggestedQuestions: [] },
        constraint: { score: 1.0, rationale: "완벽", weakPoints: [], suggestedQuestions: [] },
        success: { score: 1.0, rationale: "완벽", weakPoints: [], suggestedQuestions: [] },
      }) as never);

      const scorer = new AmbiguityScorer();
      const result = await scorer.evaluate("test-key", [
        { type: "summary", answer: "구체적인 요약" },
      ]);

      expect(result.ambiguityScore).toBe(0);
      expect(result.clarityPercent).toBe(100);
      expect(result.gateStatus).toBe("pass");
    });

    it("Brownfield 판별 경계값 — 키워드 정확히 2개면 brownfield", () => {
      const scorer = new AmbiguityScorer();
      // "기존" + "레거시" = 2개 → brownfield
      expect(scorer.detectProjectType([
        { type: "background", answer: "기존 레거시 정리 프로젝트" },
      ])).toBe("brownfield");
    });

    it("Brownfield 판별 경계값 — 키워드 정확히 1개면 greenfield", () => {
      const scorer = new AmbiguityScorer();
      // "기존" 1개만 → greenfield
      expect(scorer.detectProjectType([
        { type: "background", answer: "기존 아이디어를 바탕으로 완전히 새로 만들어요" },
      ])).toBe("greenfield");
    });

    it("LLM이 score > 1.0 반환 시 1.0으로 클램핑", async () => {
      mockCallLLM.mockResolvedValueOnce(makeLLMResponse({
        goal: { score: 1.5, rationale: "초과", weakPoints: [], suggestedQuestions: [] },
        constraint: { score: -0.3, rationale: "음수", weakPoints: [], suggestedQuestions: [] },
        success: { score: 0.7, rationale: "정상", weakPoints: [], suggestedQuestions: [] },
      }) as never);

      const scorer = new AmbiguityScorer();
      const result = await scorer.evaluate("test-key", [
        { type: "summary", answer: "테스트" },
      ]);

      expect(result.dimensions.find((d) => d.dimension === "goal")?.score).toBe(1.0);
      expect(result.dimensions.find((d) => d.dimension === "constraint")?.score).toBe(0);
    });

    it("getAffectedDimensions — objectives → goal, success 반환", () => {
      const scorer = new AmbiguityScorer();
      const affected = scorer.getAffectedDimensions("objectives");
      expect(affected).toEqual(["goal", "success"]);
    });

    it("getAffectedDimensions — 알 수 없는 섹션 → 빈 배열", () => {
      const scorer = new AmbiguityScorer();
      const affected = scorer.getAffectedDimensions("unknown_section");
      expect(affected).toEqual([]);
    });

    it("빈 답변 배열 — sections 0개로 평가 시 정상 동작", async () => {
      mockCallLLM.mockResolvedValueOnce(makeLLMResponse({
        goal: { score: 0.0, rationale: "입력 없음", weakPoints: ["답변 없음"], suggestedQuestions: ["프로젝트 목표를 설명해주세요"] },
        constraint: { score: 0.0, rationale: "입력 없음", weakPoints: [], suggestedQuestions: [] },
        success: { score: 0.0, rationale: "입력 없음", weakPoints: [], suggestedQuestions: [] },
      }) as never);

      const scorer = new AmbiguityScorer();
      const result = await scorer.evaluate("test-key", []);

      expect(result.projectType).toBe("greenfield");
      expect(result.gateStatus).toBe("block");
      expect(result.ambiguityScore).toBe(1);
      expect(result.dimensions).toHaveLength(4);
    });

    it("LLM이 null dimension score 반환 시 score 0 fallback", async () => {
      mockCallLLM.mockResolvedValueOnce({
        content: [{ type: "text" as const, text: JSON.stringify({
          dimensions: {
            goal: null,
            constraint: { score: 0.5, rationale: "보통", weakPoints: [], suggestedQuestions: [] },
            success: null,
          },
        }) }],
      } as never);

      const scorer = new AmbiguityScorer();
      const result = await scorer.evaluate("test-key", [{ type: "summary", answer: "테스트" }]);

      expect(result.dimensions.find((d) => d.dimension === "goal")?.score).toBe(0);
      expect(result.dimensions.find((d) => d.dimension === "goal")?.rationale).toBe("평가 실패");
      expect(result.dimensions.find((d) => d.dimension === "constraint")?.score).toBe(0.5);
      expect(result.dimensions.find((d) => d.dimension === "success")?.score).toBe(0);
    });

    it("모든 차원이 정확히 0.2 경계값 — ambiguity 0.8 → block", async () => {
      mockCallLLM.mockResolvedValueOnce(makeLLMResponse({
        goal: { score: 0.2, rationale: "경계", weakPoints: ["최소"], suggestedQuestions: [] },
        constraint: { score: 0.2, rationale: "경계", weakPoints: ["최소"], suggestedQuestions: [] },
        success: { score: 0.2, rationale: "경계", weakPoints: ["최소"], suggestedQuestions: [] },
      }) as never);

      const scorer = new AmbiguityScorer();
      const result = await scorer.evaluate("test-key", [{ type: "summary", answer: "최소한의 내용" }]);

      // greenfield: (0.2*0.4 + 0.2*0.3 + 0.2*0.3) / 1.0 = 0.20
      // ambiguity = 1 - 0.20 = 0.80 → block
      expect(result.ambiguityScore).toBeCloseTo(0.8, 5);
      expect(result.clarityPercent).toBe(20);
      expect(result.gateStatus).toBe("block");
    });

    it("gate threshold 정확한 경계 — ambiguity 0.2일 때 pass", async () => {
      // 모든 차원 0.8이면 clarity = 0.8, ambiguity = 0.2 → pass (<=0.2)
      mockCallLLM.mockResolvedValueOnce(makeLLMResponse({
        goal: { score: 0.8, rationale: "명확", weakPoints: [], suggestedQuestions: [] },
        constraint: { score: 0.8, rationale: "명확", weakPoints: [], suggestedQuestions: [] },
        success: { score: 0.8, rationale: "명확", weakPoints: [], suggestedQuestions: [] },
      }) as never);

      const scorer = new AmbiguityScorer();
      const result = await scorer.evaluate("test-key", [{ type: "summary", answer: "명확한 프로젝트" }]);

      // clarity = 0.8, ambiguity = 0.2 → exactly at gateThreshold → pass
      expect(result.ambiguityScore).toBeCloseTo(0.2, 5);
      expect(result.gateStatus).toBe("pass");
    });
  });

  // ── 커스텀 config ──────────────────────────────────────────────

  describe("custom config", () => {
    it("gateThreshold/warnThreshold 커스텀 적용", async () => {
      // 매우 엄격: gate=0.1, warn=0.2
      mockCallLLM.mockResolvedValueOnce(makeLLMResponse({
        goal: { score: 0.85, rationale: "좋음", weakPoints: [], suggestedQuestions: [] },
        constraint: { score: 0.85, rationale: "좋음", weakPoints: [], suggestedQuestions: [] },
        success: { score: 0.85, rationale: "좋음", weakPoints: [], suggestedQuestions: [] },
      }) as never);

      const scorer = new AmbiguityScorer({ gateThreshold: 0.1, warnThreshold: 0.2 });
      const result = await scorer.evaluate("test-key", [{ type: "summary", answer: "프로젝트" }]);

      // ambiguity = 1 - 0.85 = 0.15 → > 0.1 gate, ≤ 0.2 warn → warn
      expect(result.gateStatus).toBe("warn");
    });
  });
});
