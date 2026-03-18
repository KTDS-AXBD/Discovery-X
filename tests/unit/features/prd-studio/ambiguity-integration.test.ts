import { describe, it, expect, vi, beforeEach } from "vitest";
import { AmbiguityScorer } from "~/features/prd-studio/lib/ambiguity-scorer";

vi.mock("~/lib/ai", () => ({
  callLLM: vi.fn(),
}));

import { callLLM } from "~/lib/ai";

const mockCallLLM = vi.mocked(callLLM);

function makeLLMResponse(
  dimensions: Record<string, {
    score: number;
    rationale?: string;
    weakPoints?: string[];
    suggestedQuestions?: string[];
  }>,
) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ dimensions }) }],
  };
}

describe("Ambiguity Score Integration — 엔드투엔드 시나리오", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("시나리오 1: 모호한 답변 → 게이트 차단 (block), isReady=false", async () => {
    mockCallLLM.mockResolvedValueOnce(makeLLMResponse({
      goal: {
        score: 0.15,
        rationale: "매우 모호 — 추상적 표현만 있음",
        weakPoints: ["구체적 목표 없음", "수치 미제시"],
        suggestedQuestions: ["구체적으로 무엇을 달성하고 싶나요?", "측정 가능한 목표가 있나요?"],
      },
      constraint: {
        score: 0.1,
        rationale: "거의 정보 없음",
        weakPoints: ["제약 조건 불명"],
        suggestedQuestions: ["기술적 제약은?", "예산 범위는?"],
      },
      success: {
        score: 0.2,
        rationale: "모호한 성공 기준",
        weakPoints: ["KPI 부재"],
        suggestedQuestions: ["어떤 지표로 성공을 판단하나요?"],
      },
    }) as never);

    const scorer = new AmbiguityScorer();
    const sections = [
      { type: "summary", answer: "좋은 시스템을 만들고 싶어요" },
      { type: "objectives", answer: "잘 되면 좋겠어요" },
      { type: "requirements", answer: "기능이 좋으면 돼요" },
    ];

    const result = await scorer.evaluate("test-key", sections);

    // 게이트 차단 확인
    expect(result.gateStatus).toBe("block");
    expect(result.ambiguityScore).toBeGreaterThan(0.4);
    expect(result.clarityPercent).toBeLessThan(60);
    expect(result.projectType).toBe("greenfield");

    // 모든 비-context 차원에 weakPoints + suggestedQuestions 존재
    for (const dim of result.dimensions) {
      if (dim.dimension !== "context") {
        expect(dim.weakPoints.length).toBeGreaterThan(0);
        expect(dim.suggestedQuestions.length).toBeGreaterThan(0);
      }
    }

    // isReady = false (block → PRD 생성 불가)
    const isReady = result.gateStatus === "pass";
    expect(isReady).toBe(false);

    // 4차원 반환 확인 (greenfield context = N/A)
    expect(result.dimensions).toHaveLength(4);
    expect(result.dimensions.find((d) => d.dimension === "context")?.rationale).toContain("미적용");
  });

  it("시나리오 2: 명확한 답변 → 게이트 통과 (pass), isReady=true", async () => {
    mockCallLLM.mockResolvedValueOnce(makeLLMResponse({
      goal: {
        score: 0.9,
        rationale: "구체적인 목표와 수치 포함",
        weakPoints: [],
        suggestedQuestions: [],
      },
      constraint: {
        score: 0.85,
        rationale: "기술/비용 제약 명확",
        weakPoints: [],
        suggestedQuestions: [],
      },
      success: {
        score: 0.88,
        rationale: "KPI 3개 이상 정의",
        weakPoints: [],
        suggestedQuestions: [],
      },
    }) as never);

    const scorer = new AmbiguityScorer();
    const sections = [
      { type: "summary", answer: "AX BD팀 내부 실험 관리 시스템 — 관찰→행동→근거→자산 축적 파이프라인" },
      { type: "objectives", answer: "월 20건 Discovery 생성, 4주 내 Gate 통과율 60%, 실험 결과 자산화 100%" },
      { type: "requirements", answer: "Remix + D1 + Edge 환경, 5명 동시 사용, 4주 타임박스, 예산 $50/분기" },
      { type: "target_users", answer: "AX BD팀원 5명, 주 5회 사용, 실험 기반 의사결정 필요" },
    ];

    const result = await scorer.evaluate("test-key", sections);

    // 게이트 통과 확인
    expect(result.gateStatus).toBe("pass");
    expect(result.ambiguityScore).toBeLessThanOrEqual(0.2);
    expect(result.clarityPercent).toBeGreaterThanOrEqual(80);

    // isReady = true
    const isReady = result.gateStatus === "pass";
    expect(isReady).toBe(true);

    // 명확한 답변 → weakPoints 비어있음
    const goalDim = result.dimensions.find((d) => d.dimension === "goal");
    expect(goalDim?.weakPoints.length).toBe(0);
    expect(goalDim?.suggestedQuestions.length).toBe(0);

    // 평가 메타데이터 확인
    expect(result.model).toBe("gpt-4.1");
    expect(result.evaluatedAt).toBeGreaterThan(0);
  });

  it("시나리오 3: 부분 답변 → 부족 차원 안내 + 보충 질문 제공", async () => {
    // Goal 명확, Constraint/Success 부족
    mockCallLLM.mockResolvedValueOnce(makeLLMResponse({
      goal: {
        score: 0.85,
        rationale: "목표 명확",
        weakPoints: [],
        suggestedQuestions: [],
      },
      constraint: {
        score: 0.5,
        rationale: "제약 일부 모호",
        weakPoints: ["기술 스택 미명시", "예산 범위 없음"],
        suggestedQuestions: ["사용할 기술 스택은?", "예산 범위는?"],
      },
      success: {
        score: 0.45,
        rationale: "KPI 부분 존재",
        weakPoints: ["정량 지표 부족"],
        suggestedQuestions: ["성공을 어떻게 측정하나요?", "구체적 KPI 3개는?"],
      },
    }) as never);

    const scorer = new AmbiguityScorer();
    const sections = [
      { type: "summary", answer: "신규 고객 유치를 위한 마케팅 자동화 시스템 구축" },
      { type: "objectives", answer: "월 100건 리드 생성, CAC $50 이하, 3개월 내 ROI 달성" },
      { type: "requirements", answer: "뭔가 적당히" },
      { type: "target_users", answer: "마케팅팀" },
    ];

    const result = await scorer.evaluate("test-key", sections);

    // greenfield weighted: (0.85*0.4 + 0.5*0.3 + 0.45*0.3) / 1.0
    // = 0.34 + 0.15 + 0.135 = 0.625
    // ambiguity = 0.375 → warn (> 0.2, <= 0.4)
    expect(result.gateStatus).toBe("warn");

    // 부족 차원 식별 (score < 0.6)
    const weakDims = result.dimensions.filter((d) =>
      d.score < 0.6 && d.dimension !== "context",
    );
    expect(weakDims.length).toBe(2);

    // Constraint, Success가 부족 차원
    const weakDimNames = weakDims.map((d) => d.dimension);
    expect(weakDimNames).toContain("constraint");
    expect(weakDimNames).toContain("success");
    expect(weakDimNames).not.toContain("goal");

    // 부족 차원에 보충 질문 존재
    for (const dim of weakDims) {
      expect(dim.suggestedQuestions.length).toBeGreaterThan(0);
      expect(dim.weakPoints.length).toBeGreaterThan(0);
    }

    // Goal은 양호 — 보충 질문 없음
    const goalDim = result.dimensions.find((d) => d.dimension === "goal");
    expect(goalDim?.score).toBeGreaterThanOrEqual(0.6);
    expect(goalDim?.suggestedQuestions.length).toBe(0);
  });

  it("시나리오 4: Brownfield 판별 + 4차원 평가 (context 포함)", async () => {
    mockCallLLM.mockResolvedValueOnce(makeLLMResponse({
      goal: {
        score: 0.75,
        rationale: "목표 대체로 명확",
        weakPoints: ["개선 후 기대 수치 미명시"],
        suggestedQuestions: ["개선 후 목표 성능은?"],
      },
      constraint: {
        score: 0.7,
        rationale: "기존 제약 설명",
        weakPoints: [],
        suggestedQuestions: [],
      },
      success: {
        score: 0.65,
        rationale: "일부 KPI 존재",
        weakPoints: ["마이그레이션 완료 기준 불명확"],
        suggestedQuestions: ["마이그레이션 완료를 어떻게 판단하나요?"],
      },
      context: {
        score: 0.8,
        rationale: "기존 시스템 설명 충분",
        weakPoints: [],
        suggestedQuestions: [],
      },
    }) as never);

    const scorer = new AmbiguityScorer();
    const sections = [
      { type: "background", answer: "기존 레거시 ERP 시스템을 마이그레이션하고 리팩토링해야 합니다. 현재 시스템은 5년 전에 구축되었으며 성능 이슈가 있습니다." },
      { type: "summary", answer: "기존 ERP를 클라우드 네이티브로 전환" },
      { type: "objectives", answer: "응답시간 50% 감소, 운영비용 30% 절감" },
      { type: "requirements", answer: "기존 데이터 100% 이전, 다운타임 4시간 이내" },
      { type: "target_users", answer: "내부 운영팀 20명" },
      { type: "solution", answer: "K8s 기반 마이크로서비스 아키텍처" },
      { type: "timeline", answer: "6개월 3단계 전환" },
    ];

    const result = await scorer.evaluate("test-key", sections);

    // Brownfield 판별 — background에 "기존", "레거시", "마이그레이션", "리팩토링" = 4개 키워드
    expect(result.projectType).toBe("brownfield");

    // 4차원 모두 실제 평가 (N/A 없음)
    expect(result.dimensions).toHaveLength(4);
    const contextDim = result.dimensions.find((d) => d.dimension === "context");
    expect(contextDim?.score).toBe(0.8);
    expect(contextDim?.rationale).not.toContain("미적용");

    // Brownfield 가중합: (0.75*0.35 + 0.7*0.25 + 0.65*0.25 + 0.8*0.15) / 1.0
    // = 0.2625 + 0.175 + 0.1625 + 0.12 = 0.72
    // ambiguity = 0.28 → warn
    expect(result.clarityPercent).toBe(72);
    expect(result.ambiguityScore).toBeCloseTo(0.28, 5);
    expect(result.gateStatus).toBe("warn");

    // LLM 호출 검증 — 1회만 호출 (4차원 동시 평가)
    expect(mockCallLLM).toHaveBeenCalledTimes(1);
    const callArgs = mockCallLLM.mock.calls[0];
    expect(callArgs[0]).toBe("test-key");
    expect(callArgs[1]).toMatchObject({
      model: "gpt-4.1",
      max_tokens: 600,
    });
  });

  it("시나리오 5: 부분 재평가 → 변경 차원만 업데이트, 게이트 상태 전환", async () => {
    // 초기 평가: block 상태
    const scorer = new AmbiguityScorer();
    const existingDimensions = [
      { dimension: "goal" as const, score: 0.3, rationale: "모호", weakPoints: ["목표 불명확"], suggestedQuestions: ["구체적 목표는?"] },
      { dimension: "constraint" as const, score: 0.7, rationale: "양호", weakPoints: [], suggestedQuestions: [] },
      { dimension: "success" as const, score: 0.25, rationale: "모호", weakPoints: ["KPI 없음"], suggestedQuestions: ["성공 지표는?"] },
      { dimension: "context" as const, score: 0, rationale: "Greenfield 프로젝트 — 맥락 차원 미적용", weakPoints: [], suggestedQuestions: [] },
    ];

    // objectives 섹션 보강 후 부분 재평가 → goal + success 업데이트
    mockCallLLM.mockResolvedValueOnce(makeLLMResponse({
      goal: { score: 0.9, rationale: "목표 보강 후 명확", weakPoints: [], suggestedQuestions: [] },
      success: { score: 0.85, rationale: "KPI 추가 후 명확", weakPoints: [], suggestedQuestions: [] },
    }) as never);

    const result = await scorer.evaluatePartial(
      "test-key",
      [
        { type: "summary", answer: "매출 20% 증가를 위한 고객 분석 대시보드" },
        { type: "objectives", answer: "월 DAU 1000명, 분석 리포트 자동 생성 50건/월, NPS 40+" },
        { type: "requirements", answer: "React + D1, 동시 접속 50명" },
        { type: "target_users", answer: "마케팅팀 PM 10명" },
      ],
      "objectives",
      existingDimensions,
    );

    // goal, success 업데이트 확인
    expect(result.dimensions.find((d) => d.dimension === "goal")?.score).toBe(0.9);
    expect(result.dimensions.find((d) => d.dimension === "success")?.score).toBe(0.85);

    // constraint는 기존값 유지
    expect(result.dimensions.find((d) => d.dimension === "constraint")?.score).toBe(0.7);
    expect(result.dimensions.find((d) => d.dimension === "constraint")?.rationale).toBe("양호");

    // 보강 후 게이트 상태 개선 확인
    // clarity = (0.9*0.4 + 0.7*0.3 + 0.85*0.3) / 1.0 = 0.36 + 0.21 + 0.255 = 0.825
    // ambiguity = 0.175 → pass (≤ 0.2)
    expect(result.gateStatus).toBe("pass");
    expect(result.clarityPercent).toBe(83); // Math.round(0.825 * 100) = 83
  });
});
