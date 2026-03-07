/**
 * Evidence 자동 생성 파이프라인 유닛 테스트
 * S1: confidence → EvidenceStrength 매핑
 * S2: 분석 카테고리 → EvidenceType, Phase → EvidenceStrength 매핑
 */

import { describe, it, expect } from "vitest";
import { mapConfidenceToStrength } from "~/lib/ai-pipeline/service";
import {
  mapCategoryToEvidenceType,
  mapPhaseToEvidenceStrength,
} from "~/features/ideas/lib/analyzer";

// ============================================================================
// S1: confidence → EvidenceStrength
// ============================================================================

describe("mapConfidenceToStrength", () => {
  it("80 이상 → A (Hard evidence)", () => {
    expect(mapConfidenceToStrength(80)).toBe("A");
    expect(mapConfidenceToStrength(100)).toBe("A");
  });

  it("60-79 → B (Direct evidence)", () => {
    expect(mapConfidenceToStrength(60)).toBe("B");
    expect(mapConfidenceToStrength(79)).toBe("B");
  });

  it("40-59 → C (Indirect evidence)", () => {
    expect(mapConfidenceToStrength(40)).toBe("C");
    expect(mapConfidenceToStrength(59)).toBe("C");
  });

  it("0-39 → D (Intuition)", () => {
    expect(mapConfidenceToStrength(0)).toBe("D");
    expect(mapConfidenceToStrength(39)).toBe("D");
  });

  it("경계값 정확히 처리", () => {
    expect(mapConfidenceToStrength(79)).toBe("B");
    expect(mapConfidenceToStrength(80)).toBe("A");
    expect(mapConfidenceToStrength(59)).toBe("C");
    expect(mapConfidenceToStrength(60)).toBe("B");
    expect(mapConfidenceToStrength(39)).toBe("D");
    expect(mapConfidenceToStrength(40)).toBe("C");
  });
});

// ============================================================================
// S2: 카테고리 → EvidenceType
// ============================================================================

describe("mapCategoryToEvidenceType", () => {
  it("market_research → DATA", () => {
    expect(mapCategoryToEvidenceType("market_research")).toBe("DATA");
  });

  it("feasibility → DATA", () => {
    expect(mapCategoryToEvidenceType("feasibility")).toBe("DATA");
  });

  it("customer_research → USER", () => {
    expect(mapCategoryToEvidenceType("customer_research")).toBe("USER");
  });

  it("industry_example → REF", () => {
    expect(mapCategoryToEvidenceType("industry_example")).toBe("REF");
  });

  it("regulation → REF", () => {
    expect(mapCategoryToEvidenceType("regulation")).toBe("REF");
  });

  it("나머지 카테고리 → ASSUMPTION", () => {
    expect(mapCategoryToEvidenceType("swot")).toBe("ASSUMPTION");
    expect(mapCategoryToEvidenceType("pestel")).toBe("ASSUMPTION");
    expect(mapCategoryToEvidenceType("value_chain")).toBe("ASSUMPTION");
    expect(mapCategoryToEvidenceType("differentiation")).toBe("ASSUMPTION");
    expect(mapCategoryToEvidenceType("bmc")).toBe("ASSUMPTION");
    expect(mapCategoryToEvidenceType("lean_canvas")).toBe("ASSUMPTION");
    expect(mapCategoryToEvidenceType("critical_thinking")).toBe("ASSUMPTION");
  });

  it("알 수 없는 카테고리 → ASSUMPTION (fallback)", () => {
    expect(mapCategoryToEvidenceType("unknown")).toBe("ASSUMPTION");
  });
});

// ============================================================================
// S2: Phase → EvidenceStrength
// ============================================================================

describe("mapPhaseToEvidenceStrength", () => {
  it("Phase 1 (사실 기반 조사) → B (Direct)", () => {
    expect(mapPhaseToEvidenceStrength(1)).toBe("B");
  });

  it("Phase 2 (전략 분석) → C (Indirect)", () => {
    expect(mapPhaseToEvidenceStrength(2)).toBe("C");
  });

  it("Phase 3 (비즈니스 모델) → C (Indirect)", () => {
    expect(mapPhaseToEvidenceStrength(3)).toBe("C");
  });
});
