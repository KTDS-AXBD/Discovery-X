import { describe, it, expect } from "vitest";
import { parsePrdAnalysisResult } from "~/features/prd-studio/lib/analysis-parser";

describe("parsePrdAnalysisResult()", () => {
  const validResult = JSON.stringify({
    prd: {
      title: "클라우드 HR SaaS PRD",
      sections: {
        summary: "## 프로젝트 요약\n...",
        background: "## 배경\n...",
        objectives: "## 목표\n...",
        target_users: "## 대상 사용자\n...",
        requirements: "## 요구사항\n...",
        solution: "## 해결 방안\n...",
        risks: "## 리스크\n...",
        timeline: "## 일정\n...",
      },
    },
    review: {
      verdict: "CONDITIONAL",
      scorecard: {
        totalScore: 72,
        items: [
          { criteria: "문제 정의 명확성", score: 8, maxScore: 10, comment: "잘 정의됨" },
          { criteria: "대상 사용자 구체성", score: 7, maxScore: 10, comment: "좀 더 구체적으로" },
          { criteria: "목표/성공기준 측정가능성", score: 8, maxScore: 10, comment: "측정 가능" },
          { criteria: "요구사항 완성도", score: 10, maxScore: 10, comment: "완벽" },
          { criteria: "해결방안 실현가능성", score: 8, maxScore: 10, comment: "실현 가능" },
          { criteria: "리스크 분석 충분성", score: 5, maxScore: 10, comment: "규제 리스크 누락" },
          { criteria: "일정 현실성", score: 6, maxScore: 10, comment: "마일스톤 부족" },
          { criteria: "전체 일관성", score: 10, maxScore: 10, comment: "일관적" },
        ],
      },
      feedbackItems: [
        { section: "risks", severity: "critical", message: "규제 리스크 누락", suggestion: "개인정보보호법 분석 추가" },
        { section: "timeline", severity: "major", message: "마일스톤 부족", suggestion: "주요 마일스톤 3개 이상 정의" },
        { section: "solution", severity: "suggestion", message: "MVP 범위 축소 권장" },
      ],
    },
  });

  // T34: 정상 JSON → sections 8개 + review 파싱
  it("T34: 정상 JSON 파싱", () => {
    const result = parsePrdAnalysisResult(validResult);

    expect(result.title).toBe("클라우드 HR SaaS PRD");
    expect(Object.keys(result.sections)).toHaveLength(8);
    expect(result.sections.summary).toContain("프로젝트 요약");
    expect(result.review).not.toBeNull();
    expect(result.review!.verdict).toBe("CONDITIONAL");
    // 합계 = 8+7+8+10+8+5+6+10 = 62, totalScore = 62*100/80 = 78 (자동 계산)
    expect(result.review!.scorecard.totalScore).toBe(78);
    expect(result.review!.feedbackItems).toHaveLength(3);
  });

  // T35: markdown 래핑된 JSON → 정상 파싱
  it("T35: markdown 래핑 JSON 파싱", () => {
    const wrapped = "```json\n" + validResult + "\n```";
    const result = parsePrdAnalysisResult(wrapped);

    expect(result.title).toBe("클라우드 HR SaaS PRD");
    expect(Object.keys(result.sections)).toHaveLength(8);
  });

  // T36: 빈 응답 → ParseError
  it("T36: 빈 응답 → ParseError", () => {
    expect(() => parsePrdAnalysisResult("")).toThrow("파싱 실패");
    expect(() => parsePrdAnalysisResult("   ")).toThrow("파싱 실패");
  });

  // T37: sections 누락 → ParseError
  it("T37: prd.sections 누락 → ParseError", () => {
    const noSections = JSON.stringify({ prd: { title: "test" }, review: {} });
    expect(() => parsePrdAnalysisResult(noSections)).toThrow("sections");
  });

  // T38: review 누락 → sections만 반환
  it("T38: review 누락 → sections만 반환, review = null", () => {
    const noReview = JSON.stringify({
      prd: {
        title: "test",
        sections: { summary: "a", background: "b", objectives: "c", target_users: "d", requirements: "e", solution: "f", risks: "g", timeline: "h" },
      },
    });
    const result = parsePrdAnalysisResult(noReview);

    expect(Object.keys(result.sections)).toHaveLength(8);
    expect(result.review).toBeNull();
  });

  // T39: 잘못된 verdict 값 → "NOT_READY" 기본값
  it("T39: 잘못된 verdict → NOT_READY 기본값", () => {
    const badVerdict = JSON.stringify({
      prd: { title: "t", sections: { summary: "a", background: "b", objectives: "c", target_users: "d", requirements: "e", solution: "f", risks: "g", timeline: "h" } },
      review: { verdict: "INVALID", scorecard: { totalScore: 50, items: [] }, feedbackItems: [] },
    });
    const result = parsePrdAnalysisResult(badVerdict);

    expect(result.review!.verdict).toBe("NOT_READY");
  });

  // T40: score 범위 초과 → clamp(0, 10)
  it("T40: score 범위 초과 → clamp(0, 10)", () => {
    const overScore = JSON.stringify({
      prd: { title: "t", sections: { summary: "a", background: "b", objectives: "c", target_users: "d", requirements: "e", solution: "f", risks: "g", timeline: "h" } },
      review: {
        verdict: "READY",
        scorecard: {
          totalScore: 90,
          items: [
            { criteria: "A", score: 15, maxScore: 10 },
            { criteria: "B", score: -3, maxScore: 10 },
          ],
        },
        feedbackItems: [],
      },
    });
    const result = parsePrdAnalysisResult(overScore);

    expect(result.review!.scorecard.items[0].score).toBe(10);
    expect(result.review!.scorecard.items[1].score).toBe(0);
  });

  // T41: feedbackItems 누락 → 빈 배열
  it("T41: feedbackItems 누락 → 빈 배열", () => {
    const noFeedback = JSON.stringify({
      prd: { title: "t", sections: { summary: "a", background: "b", objectives: "c", target_users: "d", requirements: "e", solution: "f", risks: "g", timeline: "h" } },
      review: { verdict: "READY", scorecard: { totalScore: 80, items: [] } },
    });
    const result = parsePrdAnalysisResult(noFeedback);

    expect(result.review!.feedbackItems).toEqual([]);
  });

  // T42: feedback_items (snake_case) → feedbackItems로 매핑
  it("T42: snake_case feedback_items → feedbackItems 매핑", () => {
    const snakeCase = JSON.stringify({
      prd: { title: "t", sections: { summary: "a", background: "b", objectives: "c", target_users: "d", requirements: "e", solution: "f", risks: "g", timeline: "h" } },
      review: {
        verdict: "READY",
        scorecard: { totalScore: 80, items: [] },
        feedback_items: [{ section: "summary", severity: "minor", message: "OK" }],
      },
    });
    const result = parsePrdAnalysisResult(snakeCase);

    expect(result.review!.feedbackItems).toHaveLength(1);
    expect(result.review!.feedbackItems[0].section).toBe("summary");
  });

  // T43: totalScore 자동 계산
  it("T43: totalScore 자동 계산 (items 합산 × 100/80)", () => {
    const autoCalc = JSON.stringify({
      prd: { title: "t", sections: { summary: "a", background: "b", objectives: "c", target_users: "d", requirements: "e", solution: "f", risks: "g", timeline: "h" } },
      review: {
        verdict: "READY",
        scorecard: {
          totalScore: 0,
          items: [
            { criteria: "A", score: 8, maxScore: 10 },
            { criteria: "B", score: 7, maxScore: 10 },
            { criteria: "C", score: 9, maxScore: 10 },
            { criteria: "D", score: 6, maxScore: 10 },
            { criteria: "E", score: 8, maxScore: 10 },
            { criteria: "F", score: 7, maxScore: 10 },
            { criteria: "G", score: 5, maxScore: 10 },
            { criteria: "H", score: 10, maxScore: 10 },
          ],
        },
        feedbackItems: [],
      },
    });
    const result = parsePrdAnalysisResult(autoCalc);

    // 합계 = 60, totalScore = 60 * 100/80 = 75
    expect(result.review!.scorecard.totalScore).toBe(75);
  });
});
