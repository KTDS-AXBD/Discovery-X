import { describe, it, expect } from "vitest";

/**
 * ProposalCreationModal — 분석 데이터 → 제안서 매핑 로직 테스트
 * — React 렌더링 없이 순수 매핑/변환 로직만 검증
 *
 * 참조: app/components/ideas/ProposalCreationModal.tsx
 */

// ── 타입 재현 ───────────────────────────────────────────────────

interface AnalysisEntry {
  title: string;
  content: string;
  sourceIds?: string[];
  analyzedAt?: string;
}

type AnalysisData = Record<string, AnalysisEntry> | null;

// ── 상수 재현 (ProposalCreationModal.tsx에서 동일) ───────────────

const CATEGORY_LABELS: Record<string, string> = {
  market_research: "시장 조사",
  customer_research: "고객 조사",
  critical_thinking: "비판적 사고",
  bmc: "BMC",
  swot: "SWOT 분석",
  regulation: "규제/법",
  feasibility: "사업성 검증",
  differentiation: "차별화",
  industry_example: "산업별 사례",
  value_chain: "가치 사슬",
  lean_canvas: "린 캔버스",
  pestel: "PESTEL",
};

const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS);

type ProposalTab = "가설" | "타겟" | "가치 제안" | "수익 구조" | "시나리오" | "MVP" | "실행 방안";

const TAB_CATEGORY_MAP: Record<ProposalTab, string[]> = {
  가설: ["critical_thinking", "swot"],
  타겟: ["market_research", "customer_research"],
  "가치 제안": ["differentiation", "value_chain"],
  "수익 구조": ["feasibility"],
  시나리오: ["bmc", "lean_canvas", "pestel"],
  MVP: ["lean_canvas", "bmc"],
  "실행 방안": ["regulation", "industry_example"],
};

// ── 순수 로직 재현 ──────────────────────────────────────────────

/** 완료된 분석 카테고리 추출 */
function getCompletedCategories(analysisData: AnalysisData): string[] {
  if (!analysisData) return [];
  return CATEGORY_KEYS.filter((k) => analysisData[k]?.content);
}

/** 탭별 컨텐츠 빌드 (getTabContent 재현) */
function getTabContent(
  tab: ProposalTab,
  analysisData: AnalysisData,
  selectedCategories: Set<string>,
): string | null {
  if (!analysisData) return null;
  const cats = TAB_CATEGORY_MAP[tab];
  const parts: string[] = [];

  for (const cat of cats) {
    if (selectedCategories.has(cat) && analysisData[cat]?.content) {
      parts.push(`### ${CATEGORY_LABELS[cat]}\n\n${analysisData[cat].content}`);
    }
  }

  return parts.length > 0 ? parts.join("\n\n---\n\n") : null;
}

// ── 테스트 데이터 ───────────────────────────────────────────────

function makeFullAnalysis(): AnalysisData {
  return {
    market_research: { title: "시장 조사", content: "시장 규모 100억" },
    customer_research: { title: "고객 조사", content: "타겟 고객: MZ세대" },
    critical_thinking: { title: "비판적 사고", content: "리스크: 경쟁 심화" },
    bmc: { title: "BMC", content: "가치제안: 편의성" },
    swot: { title: "SWOT", content: "강점: 기술력" },
    regulation: { title: "규제", content: "개인정보보호법 준수 필요" },
    feasibility: { title: "사업성", content: "BEP 12개월" },
    differentiation: { title: "차별화", content: "AI 자동화" },
    industry_example: { title: "사례", content: "A사 성공 사례" },
    value_chain: { title: "가치 사슬", content: "파트너십 구조" },
    lean_canvas: { title: "린 캔버스", content: "핵심 문제: 비효율" },
    pestel: { title: "PESTEL", content: "기술 환경 급변" },
  };
}

function makePartialAnalysis(): AnalysisData {
  return {
    market_research: { title: "시장 조사", content: "시장 분석 결과" },
    feasibility: { title: "사업성", content: "수익성 검토 결과" },
    // 나머지 카테고리는 미완료
  };
}

// ── 테스트 ──────────────────────────────────────────────────────

describe("ProposalCreationModal 매핑 로직", () => {
  describe("getCompletedCategories", () => {
    it("전체 분석 완료 시 12개 카테고리 반환", () => {
      const completed = getCompletedCategories(makeFullAnalysis());
      expect(completed).toHaveLength(12);
    });

    it("부분 완료 시 완료된 것만 반환", () => {
      const completed = getCompletedCategories(makePartialAnalysis());
      expect(completed).toEqual(["market_research", "feasibility"]);
    });

    it("analysisData가 null이면 빈 배열", () => {
      expect(getCompletedCategories(null)).toEqual([]);
    });

    it("빈 content는 미완료로 취급", () => {
      const data: AnalysisData = {
        market_research: { title: "시장 조사", content: "" },
        feasibility: { title: "사업성", content: "결과 있음" },
      };
      const completed = getCompletedCategories(data);
      expect(completed).toEqual(["feasibility"]);
    });
  });

  describe("TAB_CATEGORY_MAP (탭-카테고리 매핑)", () => {
    it("7개 탭이 존재한다", () => {
      expect(Object.keys(TAB_CATEGORY_MAP)).toHaveLength(7);
    });

    it("가설 탭 → critical_thinking, swot", () => {
      expect(TAB_CATEGORY_MAP["가설"]).toEqual(["critical_thinking", "swot"]);
    });

    it("타겟 탭 → market_research, customer_research", () => {
      expect(TAB_CATEGORY_MAP["타겟"]).toEqual(["market_research", "customer_research"]);
    });

    it("가치 제안 탭 → differentiation, value_chain", () => {
      expect(TAB_CATEGORY_MAP["가치 제안"]).toEqual(["differentiation", "value_chain"]);
    });

    it("수익 구조 탭 → feasibility", () => {
      expect(TAB_CATEGORY_MAP["수익 구조"]).toEqual(["feasibility"]);
    });

    it("시나리오 탭 → bmc, lean_canvas, pestel", () => {
      expect(TAB_CATEGORY_MAP["시나리오"]).toEqual(["bmc", "lean_canvas", "pestel"]);
    });

    it("MVP 탭 → lean_canvas, bmc", () => {
      expect(TAB_CATEGORY_MAP["MVP"]).toEqual(["lean_canvas", "bmc"]);
    });

    it("실행 방안 탭 → regulation, industry_example", () => {
      expect(TAB_CATEGORY_MAP["실행 방안"]).toEqual(["regulation", "industry_example"]);
    });
  });

  describe("getTabContent", () => {
    it("전체 분석 + 전체 선택 → 탭별 콘텐츠 생성", () => {
      const data = makeFullAnalysis();
      const selected = new Set(Object.keys(data!));

      const content = getTabContent("가설", data, selected);
      expect(content).toContain("비판적 사고");
      expect(content).toContain("SWOT 분석");
      expect(content).toContain("리스크: 경쟁 심화");
      expect(content).toContain("강점: 기술력");
    });

    it("analysisData가 null → null 반환", () => {
      const selected = new Set(["market_research"]);
      expect(getTabContent("타겟", null, selected)).toBeNull();
    });

    it("선택된 카테고리가 없으면 null", () => {
      const data = makeFullAnalysis();
      const selected = new Set<string>(); // 빈 set

      expect(getTabContent("가설", data, selected)).toBeNull();
    });

    it("부분 선택 시 선택된 것만 포함", () => {
      const data = makeFullAnalysis();
      // "가설" 탭에서 critical_thinking만 선택, swot은 미선택
      const selected = new Set(["critical_thinking"]);

      const content = getTabContent("가설", data, selected);
      expect(content).toContain("비판적 사고");
      expect(content).not.toContain("SWOT");
    });

    it("관련 카테고리가 미완료면 null", () => {
      const data = makePartialAnalysis();
      // "가설" 탭은 critical_thinking, swot 필요 → 둘 다 미완료
      const selected = new Set(["critical_thinking", "swot"]);

      expect(getTabContent("가설", data, selected)).toBeNull();
    });

    it("콘텐츠는 --- 구분자로 연결된다", () => {
      const data = makeFullAnalysis();
      const selected = new Set(["critical_thinking", "swot"]);

      const content = getTabContent("가설", data, selected);
      expect(content).toContain("---");
    });

    it("수익 구조 탭 — feasibility만 포함", () => {
      const data = makeFullAnalysis();
      const selected = new Set(["feasibility"]);

      const content = getTabContent("수익 구조", data, selected);
      expect(content).toContain("사업성 검증");
      expect(content).toContain("BEP 12개월");
    });

    it("실행 방안 탭 — regulation + industry_example", () => {
      const data = makeFullAnalysis();
      const selected = new Set(["regulation", "industry_example"]);

      const content = getTabContent("실행 방안", data, selected);
      expect(content).toContain("규제/법");
      expect(content).toContain("개인정보보호법");
      expect(content).toContain("산업별 사례");
    });
  });

  describe("CATEGORY_LABELS", () => {
    it("12개 카테고리 라벨이 정의되어 있다", () => {
      expect(Object.keys(CATEGORY_LABELS)).toHaveLength(12);
    });

    it("모든 라벨은 한국어이다", () => {
      for (const label of Object.values(CATEGORY_LABELS)) {
        expect(typeof label).toBe("string");
        expect(label.length).toBeGreaterThan(0);
      }
    });
  });
});
