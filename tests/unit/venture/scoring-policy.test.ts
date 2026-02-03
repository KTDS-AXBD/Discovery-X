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
} from "~/features/venture/domain/scoring-policy";
import type { VdScore, VdEvidence, VdDepthScoreBreakdown } from "~/features/venture/types";

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

describe("calculateDepthScore와 통합 테스트", () => {
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
