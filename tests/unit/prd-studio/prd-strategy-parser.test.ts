import { describe, it, expect } from "vitest";
import { parseStrategyResult } from "~/features/prd-studio/lib/strategy-parser";

describe("parseStrategyResult()", () => {
  const fullResult = JSON.stringify({
    swot: {
      strengths: ["기술력", "팀 역량", "시장 선점"],
      weaknesses: ["자금 부족", "브랜드 인지도 낮음"],
      opportunities: ["시장 성장", "규제 완화"],
      threats: ["대기업 진입", "경기 침체"],
      crossAnalysis: "강점을 활용하여 시장 성장 기회를 선점할 수 있다.",
    },
    leanCanvas: {
      problem: "HR 담당자의 비효율적 채용 프로세스",
      solution: "AI 매칭 자동화",
      keyMetrics: "채용 소요 시간 50% 단축",
      uniqueValueProp: "AI 기반 즉시 매칭",
      unfairAdvantage: "독자 알고리즘 특허",
      channels: "LinkedIn, HR 커뮤니티",
      customerSegments: "중소기업 HR 팀",
      costStructure: "클라우드 인프라 + AI 모델 비용",
      revenueStreams: "월간 구독 SaaS",
    },
    jtbd: {
      who: "중소기업 HR 담당자",
      why: "채용 프로세스를 효율화하고 싶다",
      whatBefore: "수작업으로 이력서 검토, 2주 이상 소요",
      how: "AI가 자동으로 이력서 매칭 및 순위 제공",
      whatAfter: "채용 소요 시간 50% 단축, 적합도 향상",
      alternatives: "워크데이, 밤부HR, 수작업",
    },
    competition: {
      directCompetitors: [
        { name: "워크데이", description: "대기업 HR SaaS", strengths: ["시장 점유율"], weaknesses: ["높은 가격"] },
      ],
      indirectCompetitors: [
        { name: "잡코리아", description: "채용 포털", strengths: ["트래픽"], weaknesses: ["매칭 부재"] },
      ],
      differentiation: "AI 매칭 + 중소기업 특화 가격",
    },
    marketSizing: {
      tam: { value: "50조원", description: "글로벌 HR Tech 시장" },
      sam: { value: "2조원", description: "국내 HR SaaS 시장" },
      som: { value: "200억원", description: "중소기업 AI 채용 시장" },
      methodology: "Top-down",
      assumptions: ["시장 성장률 15%", "중소기업 비중 60%"],
    },
    riskAssessment: {
      risks: [
        { category: "기술", description: "AI 정확도 문제", impact: "high", likelihood: "medium", mitigation: "A/B 테스트 강화" },
        { category: "시장", description: "경쟁사 가격 경쟁", impact: "medium", likelihood: "high", mitigation: "차별화 전략" },
        { category: "규제", description: "개인정보보호법", impact: "high", likelihood: "low", mitigation: "법률 자문" },
      ],
      overallRiskLevel: "medium",
      summary: "기술과 규제 리스크를 선제적으로 관리하면 실행 가능성이 높다.",
    },
  });

  // T7: 정상 파싱 — 6프레임워크 전부 포함
  it("T7: 정상 JSON 파싱 — 6프레임워크 전체", () => {
    const result = parseStrategyResult(fullResult);

    expect(result.swot.strengths).toHaveLength(3);
    expect(result.swot.crossAnalysis).toContain("선점");
    expect(result.leanCanvas.problem).toContain("채용");
    expect(result.jtbd.who).toBe("중소기업 HR 담당자");
    expect(result.competition.directCompetitors).toHaveLength(1);
    expect(result.competition.directCompetitors[0].name).toBe("워크데이");
    expect(result.marketSizing.tam.value).toBe("50조원");
    expect(result.marketSizing.assumptions).toHaveLength(2);
    expect(result.riskAssessment.risks).toHaveLength(3);
    expect(result.riskAssessment.overallRiskLevel).toBe("medium");
  });

  // T8: markdown wrapper 제거
  it("T8: markdown ```json 래핑 제거", () => {
    const wrapped = "```json\n" + fullResult + "\n```";
    const result = parseStrategyResult(wrapped);

    expect(result.swot.strengths).toHaveLength(3);
    expect(result.leanCanvas.problem).toContain("채용");
  });

  // T9: 부분 결과 — swot만 있고 나머지 없으면 기본값
  it("T9: 부분 결과 — swot만 있으면 나머지 기본값", () => {
    const partial = JSON.stringify({
      swot: {
        strengths: ["기술력"],
        weaknesses: [],
        opportunities: [],
        threats: [],
        crossAnalysis: "",
      },
    });
    const result = parseStrategyResult(partial);

    expect(result.swot.strengths).toEqual(["기술력"]);
    expect(result.leanCanvas.problem).toBe("");
    expect(result.jtbd.who).toBe("");
    expect(result.competition.directCompetitors).toEqual([]);
    expect(result.marketSizing.tam.value).toBe("");
    expect(result.riskAssessment.risks).toEqual([]);
    expect(result.riskAssessment.overallRiskLevel).toBe("medium");
  });

  // T10: snake_case 호환
  it("T10: snake_case 키 → camelCase 매핑", () => {
    const snakeCase = JSON.stringify({
      swot: { strengths: ["A"], weaknesses: [], opportunities: [], threats: [], cross_analysis: "교차 분석" },
      lean_canvas: { problem: "문제", key_metrics: "지표", unique_value_prop: "UVP", unfair_advantage: "우위", customer_segments: "세그먼트", cost_structure: "비용", revenue_streams: "수익", solution: "", channels: "" },
      jtbd: { who: "", why: "", what_before: "이전", how: "", what_after: "이후", alternatives: "" },
      competition: { direct_competitors: [{ name: "A", description: "d", strengths: [], weaknesses: [] }], indirect_competitors: [], differentiation: "차별화" },
      market_sizing: { tam: { value: "100억" }, sam: { value: "50억" }, som: { value: "10억" }, methodology: "", assumptions: [] },
      risk_assessment: { risks: [{ category: "기술", description: "d", impact: "high", likelihood: "low", mitigation: "m" }], overall_risk_level: "low", summary: "" },
    });
    const result = parseStrategyResult(snakeCase);

    expect(result.swot.crossAnalysis).toBe("교차 분석");
    expect(result.leanCanvas.keyMetrics).toBe("지표");
    expect(result.leanCanvas.uniqueValueProp).toBe("UVP");
    expect(result.leanCanvas.unfairAdvantage).toBe("우위");
    expect(result.leanCanvas.customerSegments).toBe("세그먼트");
    expect(result.leanCanvas.costStructure).toBe("비용");
    expect(result.leanCanvas.revenueStreams).toBe("수익");
    expect(result.jtbd.whatBefore).toBe("이전");
    expect(result.jtbd.whatAfter).toBe("이후");
    expect(result.competition.directCompetitors).toHaveLength(1);
    expect(result.marketSizing.tam.value).toBe("100억");
    expect(result.riskAssessment.overallRiskLevel).toBe("low");
  });

  // T11: impact/likelihood 정규화
  it("T11: impact/likelihood 정규화 — 대소문자 + 잘못된 값", () => {
    const abnormal = JSON.stringify({
      riskAssessment: {
        risks: [
          { category: "기술", description: "d", impact: "HIGH", likelihood: "LOW", mitigation: "m" },
          { category: "시장", description: "d", impact: "invalid", likelihood: "EXTREME", mitigation: "m" },
          { category: "규제", description: "d", impact: "Medium", likelihood: "high", mitigation: "m" },
        ],
        overallRiskLevel: "CRITICAL",
        summary: "",
      },
    });
    const result = parseStrategyResult(abnormal);

    expect(result.riskAssessment.risks[0].impact).toBe("high");
    expect(result.riskAssessment.risks[0].likelihood).toBe("low");
    expect(result.riskAssessment.risks[1].impact).toBe("medium");
    expect(result.riskAssessment.risks[1].likelihood).toBe("medium");
    expect(result.riskAssessment.risks[2].impact).toBe("medium");
    expect(result.riskAssessment.risks[2].likelihood).toBe("high");
    expect(result.riskAssessment.overallRiskLevel).toBe("medium");
  });
});
