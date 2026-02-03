/**
 * Scoring Policy 단위 테스트
 *
 * - calculatePotentialScore: Gate 점수 또는 Evidence 기반 Potential 계산
 * - calculateConfidenceScore: Depth 요소 기반 Confidence 계산
 */

import { describe, it, expect } from "vitest";
import {
  calculatePotentialScore,
  calculateConfidenceScore,
  calculateDepthScore,
  calculateEffortScore,
  calculateNextRoi,
  rankOpportunities,
  HUMAN_EFFORT_WEIGHTS,
  AGENT_EFFORT_WEIGHTS,
} from "~/features/venture/domain/scoring-policy";
import type {
  VdScore,
  VdEvidence,
  VdDepthScoreBreakdown,
  VdAssumption,
  VdPremortem,
  VdArtifact,
  VdWorkEvent,
} from "~/features/venture/types";

describe("calculatePotentialScore", () => {
  it("Gate 점수가 있으면 평균값을 반환한다", () => {
    const scores: VdScore[] = [
      {
        id: "s1",
        opportunityId: "opp1",
        dimension: "potential",
        value: 80,
        source: "human",
        metadata: null,
        createdAt: new Date(),
      },
      {
        id: "s2",
        opportunityId: "opp1",
        dimension: "potential",
        value: 60,
        source: "agent",
        metadata: null,
        createdAt: new Date(),
      },
    ];
    const evidences: VdEvidence[] = [];

    const result = calculatePotentialScore(scores, evidences);

    expect(result).toBe(70); // (80 + 60) / 2
  });

  it("Gate 점수 중 potential dimension만 사용한다", () => {
    const scores: VdScore[] = [
      {
        id: "s1",
        opportunityId: "opp1",
        dimension: "potential",
        value: 90,
        source: "human",
        metadata: null,
        createdAt: new Date(),
      },
      {
        id: "s2",
        opportunityId: "opp1",
        dimension: "confidence", // potential 아님
        value: 40,
        source: "human",
        metadata: null,
        createdAt: new Date(),
      },
    ];
    const evidences: VdEvidence[] = [];

    const result = calculatePotentialScore(scores, evidences);

    expect(result).toBe(90); // potential만 사용
  });

  it("Gate 점수가 없고 Evidence도 없으면 최소값 20을 반환한다", () => {
    const scores: VdScore[] = [];
    const evidences: VdEvidence[] = [];

    const result = calculatePotentialScore(scores, evidences);

    expect(result).toBe(20);
  });

  it("Gate 점수가 없으면 Evidence A/B급 비율 기반 휴리스틱을 사용한다", () => {
    const scores: VdScore[] = [];
    const evidences: VdEvidence[] = [
      {
        id: "e1",
        sprintId: "sp1",
        opportunityId: "opp1",
        signalId: null,
        type: "DATA",
        strength: "A",
        content: "test",
        sourceUrl: null,
        sourceTitle: null,
        metadata: null,
        createdAt: new Date(),
      },
      {
        id: "e2",
        sprintId: "sp1",
        opportunityId: "opp1",
        signalId: null,
        type: "DATA",
        strength: "B",
        content: "test",
        sourceUrl: null,
        sourceTitle: null,
        metadata: null,
        createdAt: new Date(),
      },
      {
        id: "e3",
        sprintId: "sp1",
        opportunityId: "opp1",
        signalId: null,
        type: "DATA",
        strength: "C",
        content: "test",
        sourceUrl: null,
        sourceTitle: null,
        metadata: null,
        createdAt: new Date(),
      },
      {
        id: "e4",
        sprintId: "sp1",
        opportunityId: "opp1",
        signalId: null,
        type: "DATA",
        strength: "D",
        content: "test",
        sourceUrl: null,
        sourceTitle: null,
        metadata: null,
        createdAt: new Date(),
      },
    ];

    const result = calculatePotentialScore(scores, evidences);

    // A/B급 2개 / 전체 4개 = 50% → 50% * 80 + 20 = 60
    expect(result).toBe(60);
  });

  it("모든 Evidence가 A/B급이면 100을 반환한다", () => {
    const scores: VdScore[] = [];
    const evidences: VdEvidence[] = [
      {
        id: "e1",
        sprintId: "sp1",
        opportunityId: "opp1",
        signalId: null,
        type: "DATA",
        strength: "A",
        content: "test",
        sourceUrl: null,
        sourceTitle: null,
        metadata: null,
        createdAt: new Date(),
      },
      {
        id: "e2",
        sprintId: "sp1",
        opportunityId: "opp1",
        signalId: null,
        type: "DATA",
        strength: "B",
        content: "test",
        sourceUrl: null,
        sourceTitle: null,
        metadata: null,
        createdAt: new Date(),
      },
    ];

    const result = calculatePotentialScore(scores, evidences);

    // 100% A/B급 → 100% * 80 + 20 = 100
    expect(result).toBe(100);
  });
});

describe("calculateConfidenceScore", () => {
  it("Depth 요소를 가중 합산하여 Confidence를 계산한다", () => {
    const depthBreakdown: VdDepthScoreBreakdown = {
      evidenceDepth: 40, // 최대 40점 → 100%
      assumptionCoverage: 25, // 최대 25점 → 100%
      riskReadiness: 15, // 최대 15점 → 100%
      executionClarity: 20, // 사용 안함
      total: 100,
    };

    const result = calculateConfidenceScore(depthBreakdown);

    // Evidence 100% * 0.5 + Assumption 100% * 0.3 + Risk 100% * 0.2 = 100
    expect(result).toBe(100);
  });

  it("Depth 요소가 모두 0이면 0을 반환한다", () => {
    const depthBreakdown: VdDepthScoreBreakdown = {
      evidenceDepth: 0,
      assumptionCoverage: 0,
      riskReadiness: 0,
      executionClarity: 0,
      total: 0,
    };

    const result = calculateConfidenceScore(depthBreakdown);

    expect(result).toBe(0);
  });

  it("Depth 요소별 가중치가 올바르게 적용된다", () => {
    const depthBreakdown: VdDepthScoreBreakdown = {
      evidenceDepth: 20, // 50% → 50점
      assumptionCoverage: 12.5, // 50% → 50점
      riskReadiness: 7.5, // 50% → 50점
      executionClarity: 10,
      total: 50,
    };

    const result = calculateConfidenceScore(depthBreakdown);

    // Evidence 50 * 0.5 + Assumption 50 * 0.3 + Risk 50 * 0.2 = 25 + 15 + 10 = 50
    expect(result).toBe(50);
  });

  it("Evidence가 높고 나머지가 낮으면 Evidence 가중치(50%)가 반영된다", () => {
    const depthBreakdown: VdDepthScoreBreakdown = {
      evidenceDepth: 40, // 100%
      assumptionCoverage: 0, // 0%
      riskReadiness: 0, // 0%
      executionClarity: 0,
      total: 40,
    };

    const result = calculateConfidenceScore(depthBreakdown);

    // Evidence 100 * 0.5 = 50
    expect(result).toBe(50);
  });

  it("Assumption이 높고 나머지가 낮으면 Assumption 가중치(30%)가 반영된다", () => {
    const depthBreakdown: VdDepthScoreBreakdown = {
      evidenceDepth: 0, // 0%
      assumptionCoverage: 25, // 100%
      riskReadiness: 0, // 0%
      executionClarity: 0,
      total: 25,
    };

    const result = calculateConfidenceScore(depthBreakdown);

    // Assumption 100 * 0.3 = 30
    expect(result).toBe(30);
  });

  it("Risk가 높고 나머지가 낮으면 Risk 가중치(20%)가 반영된다", () => {
    const depthBreakdown: VdDepthScoreBreakdown = {
      evidenceDepth: 0, // 0%
      assumptionCoverage: 0, // 0%
      riskReadiness: 15, // 100%
      executionClarity: 0,
      total: 15,
    };

    const result = calculateConfidenceScore(depthBreakdown);

    // Risk 100 * 0.2 = 20
    expect(result).toBe(20);
  });
});

describe("calculateDepthScore", () => {
  // Helper factories
  const makeEvidence = (overrides: Partial<VdEvidence> = {}): VdEvidence => ({
    id: crypto.randomUUID(),
    sprintId: "sp1",
    opportunityId: "opp1",
    signalId: null,
    type: "DATA",
    strength: "B",
    content: "test evidence",
    sourceUrl: null,
    sourceTitle: null,
    metadata: null,
    createdAt: new Date(),
    ...overrides,
  });

  const makeAssumption = (overrides: Partial<VdAssumption> = {}): VdAssumption => ({
    id: crypto.randomUUID(),
    opportunityId: "opp1",
    statement: "test assumption",
    criticality: 3,
    confidence: 50,
    validationMethod: null,
    status: "OPEN",
    evidenceIds: null,
    createdAt: new Date(),
    ...overrides,
  });

  const makePremortem = (overrides: Partial<VdPremortem> = {}): VdPremortem => ({
    id: crypto.randomUUID(),
    opportunityId: "opp1",
    failureScenario: "test failure",
    probability: 50,
    impact: 3,
    mitigationStrategy: null,
    createdAt: new Date(),
    ...overrides,
  });

  const makeArtifact = (overrides: Partial<VdArtifact> = {}): VdArtifact => ({
    id: crypto.randomUUID(),
    opportunityId: "opp1",
    artifactType: "LEAN_CANVAS",
    title: "Test Canvas",
    content: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe("evidenceDepth 계산", () => {
    it("Evidence 개수에 따른 점수를 계산한다 (최대 10개 기준)", () => {
      // 5개 Evidence → 50% → 10점 (개수 점수)
      const evidences = Array.from({ length: 5 }, () => makeEvidence());
      const result = calculateDepthScore({
        evidences,
        assumptions: [],
        premortems: [],
        artifacts: [],
        opportunity: {},
      });

      // 개수 점수: 5/10 * 20 = 10
      // 출처 다양성: 0 (sourceUrl 없음)
      // 강도: 5/5 * 10 = 10 (모두 B급)
      expect(result.evidenceDepth).toBe(20);
    });

    it("출처 다양성 (도메인 수)을 반영한다", () => {
      const evidences = [
        makeEvidence({ sourceUrl: "https://example.com/1" }),
        makeEvidence({ sourceUrl: "https://example.com/2" }),
        makeEvidence({ sourceUrl: "https://other.com/1" }),
        makeEvidence({ sourceUrl: "https://third.org/1" }),
      ];
      const result = calculateDepthScore({
        evidences,
        assumptions: [],
        premortems: [],
        artifacts: [],
        opportunity: {},
      });

      // 개수: 4/10 * 20 = 8
      // 다양성: 3 domains / 5 * 10 = 6
      // 강도: 4/4 * 10 = 10
      expect(result.evidenceDepth).toBe(24);
    });

    it("A/B급 Evidence 비율을 반영한다", () => {
      const evidences = [
        makeEvidence({ strength: "A" }),
        makeEvidence({ strength: "B" }),
        makeEvidence({ strength: "C" }),
        makeEvidence({ strength: "D" }),
      ];
      const result = calculateDepthScore({
        evidences,
        assumptions: [],
        premortems: [],
        artifacts: [],
        opportunity: {},
      });

      // 개수: 4/10 * 20 = 8
      // 다양성: 0
      // 강도: 2/4 * 10 = 5
      expect(result.evidenceDepth).toBe(13);
    });

    it("잘못된 URL은 unknown으로 처리한다", () => {
      const evidences = [
        makeEvidence({ sourceUrl: "not-a-valid-url" }),
        makeEvidence({ sourceUrl: "https://valid.com/page" }),
      ];
      const result = calculateDepthScore({
        evidences,
        assumptions: [],
        premortems: [],
        artifacts: [],
        opportunity: {},
      });

      // 2 domains (unknown + valid.com)
      // 개수: 2/10 * 20 = 4
      // 다양성: 2/5 * 10 = 4
      // 강도: 2/2 * 10 = 10
      expect(result.evidenceDepth).toBe(18);
    });
  });

  describe("assumptionCoverage 계산", () => {
    it("핵심 가정(criticality >= 4) 개수를 반영한다", () => {
      const assumptions = [
        makeAssumption({ criticality: 5 }),
        makeAssumption({ criticality: 4 }),
        makeAssumption({ criticality: 3 }),
      ];
      const result = calculateDepthScore({
        evidences: [],
        assumptions,
        premortems: [],
        artifacts: [],
        opportunity: {},
      });

      // 핵심: 2/5 * 15 = 6
      // 계획: 0
      // 검증: 0
      expect(result.assumptionCoverage).toBe(6);
    });

    it("검증 계획(validationMethod) 유무를 반영한다", () => {
      const assumptions = [
        makeAssumption({ validationMethod: "User interview" }),
        makeAssumption({ validationMethod: "A/B test" }),
        makeAssumption({ validationMethod: null }),
      ];
      const result = calculateDepthScore({
        evidences: [],
        assumptions,
        premortems: [],
        artifacts: [],
        opportunity: {},
      });

      // 핵심: 0
      // 계획: 2/3 * 5 ≈ 3.33
      // 검증: 0
      expect(result.assumptionCoverage).toBe(3);
    });

    it("VALIDATED 상태 비율을 반영한다", () => {
      const assumptions = [
        makeAssumption({ status: "VALIDATED" }),
        makeAssumption({ status: "VALIDATED" }),
        makeAssumption({ status: "OPEN" }),
        makeAssumption({ status: "INVALIDATED" }),
      ];
      const result = calculateDepthScore({
        evidences: [],
        assumptions,
        premortems: [],
        artifacts: [],
        opportunity: {},
      });

      // 핵심: 0
      // 계획: 0
      // 검증: 2/4 * 5 = 2.5
      expect(result.assumptionCoverage).toBe(3);
    });
  });

  describe("riskReadiness 계산", () => {
    it("Pre-mortem 개수를 반영한다 (최대 5개)", () => {
      const premortems = [
        makePremortem(),
        makePremortem(),
        makePremortem(),
      ];
      const result = calculateDepthScore({
        evidences: [],
        assumptions: [],
        premortems,
        artifacts: [],
        opportunity: {},
      });

      // 개수: 3/5 * 8 = 4.8
      // 완화책: 0
      expect(result.riskReadiness).toBe(5);
    });

    it("완화책(mitigationStrategy) 구체성을 반영한다", () => {
      const premortems = [
        makePremortem({ mitigationStrategy: "This is a detailed mitigation plan" }), // 21자 이상
        makePremortem({ mitigationStrategy: "Short" }), // 20자 미만
        makePremortem({ mitigationStrategy: null }),
      ];
      const result = calculateDepthScore({
        evidences: [],
        assumptions: [],
        premortems,
        artifacts: [],
        opportunity: {},
      });

      // 개수: 3/5 * 8 = 4.8
      // 완화책: 1/3 * 7 ≈ 2.33
      expect(result.riskReadiness).toBe(7);
    });
  });

  describe("executionClarity 계산", () => {
    it("Lean Canvas artifact가 있으면 점수를 추가한다", () => {
      const artifacts = [
        makeArtifact({
          artifactType: "LEAN_CANVAS",
          content: {
            customer_segments: "SMB",
            channels: "Direct sales",
            cost_structure: "$10k/mo",
          },
        }),
      ];
      const result = calculateDepthScore({
        evidences: [],
        assumptions: [],
        premortems: [],
        artifacts,
        opportunity: {},
      });

      // customer_segments: 4
      // cost_structure: 4
      // channels: 6
      expect(result.executionClarity).toBe(14);
    });

    it("targetSegment 필드가 있으면 점수를 추가한다", () => {
      const result = calculateDepthScore({
        evidences: [],
        assumptions: [],
        premortems: [],
        artifacts: [],
        opportunity: { targetSegment: "Enterprise companies" }, // 10자 이상
      });

      expect(result.executionClarity).toBe(3);
    });

    it("description이 상세하면 점수를 추가한다", () => {
      const result = calculateDepthScore({
        evidences: [],
        assumptions: [],
        premortems: [],
        artifacts: [],
        opportunity: {
          description: "A".repeat(201), // 200자 초과
        },
      });

      expect(result.executionClarity).toBe(3);
    });
  });

  it("모든 요소를 종합하여 total을 계산한다", () => {
    const evidences = Array.from({ length: 10 }, (_, i) =>
      makeEvidence({
        strength: i < 8 ? "A" : "C",
        sourceUrl: `https://source${i % 5}.com/page`,
      })
    );
    const assumptions = Array.from({ length: 5 }, (_, i) =>
      makeAssumption({
        criticality: 4,
        validationMethod: "Test method",
        status: i < 3 ? "VALIDATED" : "OPEN",
      })
    );
    const premortems = Array.from({ length: 5 }, () =>
      makePremortem({
        mitigationStrategy: "This is a concrete mitigation plan",
      })
    );
    const artifacts = [
      makeArtifact({
        artifactType: "LEAN_CANVAS",
        content: {
          customer_segments: "SMB",
          channels: "Direct",
          revenue_streams: "SaaS",
        },
      }),
    ];

    const result = calculateDepthScore({
      evidences,
      assumptions,
      premortems,
      artifacts,
      opportunity: {
        targetSegment: "Mid-market SaaS",
        description: "A".repeat(250),
      },
    });

    expect(result.evidenceDepth).toBeGreaterThan(30);
    expect(result.assumptionCoverage).toBeGreaterThan(20);
    expect(result.riskReadiness).toBeGreaterThan(10);
    expect(result.executionClarity).toBeGreaterThan(15);
    expect(result.total).toBe(
      result.evidenceDepth +
        result.assumptionCoverage +
        result.riskReadiness +
        result.executionClarity
    );
  });

  it("Evidence 없이 calculateDepthScore → calculateConfidenceScore 체인이 동작한다", () => {
    const depthBreakdown = calculateDepthScore({
      evidences: [],
      assumptions: [],
      premortems: [],
      artifacts: [],
      opportunity: {},
    });

    const confidence = calculateConfidenceScore(depthBreakdown);

    expect(depthBreakdown.total).toBe(0);
    expect(confidence).toBe(0);
  });
});

describe("calculateEffortScore", () => {
  const makeWorkEvent = (overrides: Partial<VdWorkEvent> = {}): VdWorkEvent => ({
    id: crypto.randomUUID(),
    sprintId: "sp1",
    eventType: "signal_create",
    actorType: "human",
    actorId: "user1",
    entityType: "signal",
    entityId: "sig1",
    metadata: null,
    createdAt: new Date(),
    ...overrides,
  });

  it("human 이벤트는 humanEffort에 가산된다", () => {
    const events = [
      makeWorkEvent({ eventType: "signal_create", actorType: "human" }),
      makeWorkEvent({ eventType: "evidence_add", actorType: "human" }),
    ];

    const result = calculateEffortScore(events);

    // signal_create: 1 + evidence_add: 2 = 3
    expect(result.humanEffort).toBe(3);
    expect(result.agentEffort).toBe(0);
  });

  it("agent 이벤트는 agentEffort에 가산된다", () => {
    const events = [
      makeWorkEvent({ eventType: "signal_collect", actorType: "agent" }),
      makeWorkEvent({ eventType: "opportunity_generate", actorType: "agent" }),
    ];

    const result = calculateEffortScore(events);

    // signal_collect: 0.5 + opportunity_generate: 2 = 2.5
    expect(result.humanEffort).toBe(0);
    expect(result.agentEffort).toBe(2.5);
  });

  it("알 수 없는 eventType은 기본 가중치를 사용한다", () => {
    const events = [
      makeWorkEvent({ eventType: "unknown_type", actorType: "human" }),
      makeWorkEvent({ eventType: "unknown_type", actorType: "agent" }),
    ];

    const result = calculateEffortScore(events);

    // human unknown: 1 (기본)
    // agent unknown: 0.5 (기본)
    expect(result.humanEffort).toBe(1);
    expect(result.agentEffort).toBe(0.5);
  });

  it("ratio는 human/agent 비율을 계산한다", () => {
    const events = [
      makeWorkEvent({ eventType: "evidence_add", actorType: "human" }), // 2
      makeWorkEvent({ eventType: "opportunity_generate", actorType: "agent" }), // 2
    ];

    const result = calculateEffortScore(events);

    expect(result.ratio.human).toBeCloseTo(0.5, 2);
    expect(result.ratio.agent).toBeCloseTo(0.5, 2);
  });

  it("이벤트가 없으면 모두 0을 반환한다", () => {
    const result = calculateEffortScore([]);

    expect(result.humanEffort).toBe(0);
    expect(result.agentEffort).toBe(0);
    expect(result.total).toBe(0);
    expect(result.ratio.human).toBe(0);
    expect(result.ratio.agent).toBe(0);
  });

  it("커스텀 가중치를 적용한다", () => {
    const events = [
      makeWorkEvent({ eventType: "custom_human", actorType: "human" }),
      makeWorkEvent({ eventType: "custom_agent", actorType: "agent" }),
    ];
    const customHumanWeights = { custom_human: 10 };
    const customAgentWeights = { custom_agent: 5 };

    const result = calculateEffortScore(events, customHumanWeights, customAgentWeights);

    expect(result.humanEffort).toBe(10);
    expect(result.agentEffort).toBe(5);
  });
});

describe("calculateNextRoi", () => {
  it("INVEST: 높은 potential, 낮은 unknowns, 높은 adjustedValue", () => {
    const result = calculateNextRoi({
      potentialScore: 80,
      confidenceScore: 70,
      depthScore: 60,
      effortScore: 20,
      unknowns: 2,
    });

    expect(result.recommendation).toBe("INVEST");
    expect(result.rationale).toContain("높은 잠재력");
  });

  it("EXPLORE: 중간 potential, 낮은 effort, 낮은 depth", () => {
    const result = calculateNextRoi({
      potentialScore: 55,
      confidenceScore: 40,
      depthScore: 30,
      effortScore: 20,
      unknowns: 3,
    });

    expect(result.recommendation).toBe("EXPLORE");
    expect(result.rationale).toContain("탐색 깊이 부족");
  });

  it("HOLD: 중간 potential, 높은 unknowns", () => {
    const result = calculateNextRoi({
      potentialScore: 60,
      confidenceScore: 50,
      depthScore: 40,
      effortScore: 30,
      unknowns: 8,
    });

    expect(result.recommendation).toBe("HOLD");
    expect(result.rationale).toContain("불확실성");
  });

  it("DROP: 낮은 potential", () => {
    const result = calculateNextRoi({
      potentialScore: 30,
      confidenceScore: 40,
      depthScore: 20,
      effortScore: 50,
      unknowns: 5,
    });

    expect(result.recommendation).toBe("DROP");
    expect(result.rationale).toContain("낮은 잠재력");
  });

  it("unknownPenalty는 최대 50이다", () => {
    const result = calculateNextRoi({
      potentialScore: 70,
      confidenceScore: 60,
      depthScore: 50,
      effortScore: 30,
      unknowns: 20, // 20 * 5 = 100 → capped to 50
    });

    expect(result.scores.unknownPenalty).toBe(50);
  });

  it("investmentValue를 올바르게 계산한다", () => {
    const result = calculateNextRoi({
      potentialScore: 80,
      confidenceScore: 60,
      depthScore: 50,
      effortScore: 30, // normalizedEffort + 10 = 40
      unknowns: 0,
    });

    // investmentValue = (80 * 60) / (30 + 10) = 4800 / 40 = 120
    expect(result.scores.investmentValue).toBe(120);
  });
});

describe("rankOpportunities", () => {
  it("compositeScore 기준 내림차순 정렬한다", () => {
    const result = rankOpportunities({
      opportunities: [
        { id: "a", potentialScore: 50, confidenceScore: 50, depthScore: 50, effortScore: 50 },
        { id: "b", potentialScore: 80, confidenceScore: 80, depthScore: 80, effortScore: 20 },
        { id: "c", potentialScore: 30, confidenceScore: 30, depthScore: 30, effortScore: 70 },
      ],
    });

    expect(result[0].id).toBe("b");
    expect(result[1].id).toBe("a");
    expect(result[2].id).toBe("c");
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(2);
    expect(result[2].rank).toBe(3);
  });

  it("기본 가중치를 적용한다", () => {
    const result = rankOpportunities({
      opportunities: [
        { id: "a", potentialScore: 100, confidenceScore: 0, depthScore: 0, effortScore: 0 },
      ],
    });

    // potential: 100 * 0.4 = 40
    // confidence: 0 * 0.3 = 0
    // depth: 0 * 0.2 = 0
    // effort: (100 - 0) * 0.1 = 10
    expect(result[0].compositeScore).toBe(50);
  });

  it("커스텀 가중치를 적용한다", () => {
    const result = rankOpportunities({
      opportunities: [
        { id: "a", potentialScore: 100, confidenceScore: 0, depthScore: 0, effortScore: 0 },
      ],
      weights: { potential: 1, confidence: 0, depth: 0, effort: 0 },
    });

    expect(result[0].compositeScore).toBe(100);
  });

  it("null 점수는 0으로 처리한다", () => {
    const result = rankOpportunities({
      opportunities: [
        { id: "a", potentialScore: null, confidenceScore: null, depthScore: null, effortScore: null },
      ],
    });

    // All null → 0, effort calc: (100 - 0) * 0.1 = 10
    expect(result[0].compositeScore).toBe(10);
  });

  it("effort는 낮을수록 유리하다", () => {
    const result = rankOpportunities({
      opportunities: [
        { id: "low-effort", potentialScore: 50, confidenceScore: 50, depthScore: 50, effortScore: 10 },
        { id: "high-effort", potentialScore: 50, confidenceScore: 50, depthScore: 50, effortScore: 90 },
      ],
    });

    // low-effort: 50*0.4 + 50*0.3 + 50*0.2 + (100-10)*0.1 = 20+15+10+9 = 54
    // high-effort: 50*0.4 + 50*0.3 + 50*0.2 + (100-90)*0.1 = 20+15+10+1 = 46
    expect(result[0].id).toBe("low-effort");
    expect(result[1].id).toBe("high-effort");
  });
});
