import { describe, it, expect } from "vitest";
import {
  buildCitationBlock,
  extractCitationsFromToolResults,
  type Citation,
} from "~/features/chat/agent/citation-builder";

interface ToolCallResult {
  name: string;
  input: Record<string, unknown>;
  result: string;
}

// ---------------------------------------------------------------------------
// buildCitationBlock
// ---------------------------------------------------------------------------

describe("buildCitationBlock", () => {
  it("빈 배열 → 빈 문자열", () => {
    expect(buildCitationBlock([])).toBe("");
  });

  it("discovery 인용 마크다운 생성", () => {
    const citations: Citation[] = [
      { type: "discovery", id: "d-001", title: "AI 실험", url: "/discoveries/d-001" },
    ];
    const result = buildCitationBlock(citations);
    expect(result).toContain("**[참조]**");
    expect(result).toContain('- [Discovery #d-001](/discoveries/d-001) — "AI 실험"');
  });

  it("중복 제거 (같은 type+id)", () => {
    const citations: Citation[] = [
      { type: "discovery", id: "d-001", title: "AI 실험", url: "/discoveries/d-001" },
      { type: "discovery", id: "d-001", title: "AI 실험 (복사)", url: "/discoveries/d-001" },
    ];
    const result = buildCitationBlock(citations);
    const matches = result.match(/Discovery #d-001/g);
    expect(matches).toHaveLength(1);
  });

  it("복수 타입 (discovery+evidence+proposal)", () => {
    const citations: Citation[] = [
      { type: "discovery", id: "d-001", title: "발견", url: "/discoveries/d-001" },
      { type: "evidence", id: "e-001", title: "근거", url: "/discoveries/d-001#evidence-e-001" },
      { type: "proposal", id: "p-001", title: "제안", url: "/proposals/p-001" },
    ];
    const result = buildCitationBlock(citations);
    expect(result).toContain("Discovery #d-001");
    expect(result).toContain("Evidence #e-001");
    expect(result).toContain("Proposal #p-001");
  });

  it("마크다운 구분선 포함", () => {
    const citations: Citation[] = [
      { type: "discovery", id: "d-001", title: "테스트", url: "/discoveries/d-001" },
    ];
    const result = buildCitationBlock(citations);
    expect(result).toContain("---");
  });

  it("같은 type 다른 id는 모두 표시", () => {
    const citations: Citation[] = [
      { type: "discovery", id: "d-001", title: "첫 번째", url: "/discoveries/d-001" },
      { type: "discovery", id: "d-002", title: "두 번째", url: "/discoveries/d-002" },
    ];
    const result = buildCitationBlock(citations);
    expect(result).toContain("Discovery #d-001");
    expect(result).toContain("Discovery #d-002");
  });

  it("다른 type 같은 id는 모두 표시", () => {
    const citations: Citation[] = [
      { type: "discovery", id: "001", title: "발견", url: "/discoveries/001" },
      { type: "proposal", id: "001", title: "제안", url: "/proposals/001" },
    ];
    const result = buildCitationBlock(citations);
    expect(result).toContain("Discovery #001");
    expect(result).toContain("Proposal #001");
  });
});

// ---------------------------------------------------------------------------
// extractCitationsFromToolResults
// ---------------------------------------------------------------------------

describe("extractCitationsFromToolResults", () => {
  it("빈 배열", () => {
    const result = extractCitationsFromToolResults([]);
    expect(result).toEqual([]);
  });

  it("discovery 단일 결과 추출", () => {
    const toolResults: ToolCallResult[] = [
      {
        name: "get_discovery_detail",
        input: { discoveryId: "d-001" },
        result: JSON.stringify({
          discovery: { id: "d-001", title: "AI 실험 발견" },
        }),
      },
    ];
    const result = extractCitationsFromToolResults(toolResults);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: "discovery",
      id: "d-001",
      title: "AI 실험 발견",
      url: "/discoveries/d-001",
    });
  });

  it("discoveries 목록 추출", () => {
    const toolResults: ToolCallResult[] = [
      {
        name: "list_discoveries",
        input: {},
        result: JSON.stringify({
          discoveries: [
            { id: "d-001", title: "발견 1" },
            { id: "d-002", title: "발견 2" },
          ],
        }),
      },
    ];
    const result = extractCitationsFromToolResults(toolResults);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("d-001");
    expect(result[1].id).toBe("d-002");
  });

  it("proposal 추출", () => {
    const toolResults: ToolCallResult[] = [
      {
        name: "get_proposal",
        input: {},
        result: JSON.stringify({
          proposal: { id: "p-001", title: "신규 제안" },
        }),
      },
    ];
    const result = extractCitationsFromToolResults(toolResults);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: "proposal",
      id: "p-001",
      title: "신규 제안",
      url: "/proposals/p-001",
    });
  });

  it("proposals 목록 추출", () => {
    const toolResults: ToolCallResult[] = [
      {
        name: "list_proposals",
        input: {},
        result: JSON.stringify({
          proposals: [
            { id: "p-001", title: "제안 A" },
            { id: "p-002", title: "제안 B" },
          ],
        }),
      },
    ];
    const result = extractCitationsFromToolResults(toolResults);
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.type === "proposal")).toBe(true);
  });

  it("중첩 evidence 추출", () => {
    const toolResults: ToolCallResult[] = [
      {
        name: "get_discovery_detail",
        input: { discoveryId: "d-001" },
        result: JSON.stringify({
          discovery: { id: "d-001", title: "메인 발견" },
          evidence: [
            { id: "e-001", title: "실험 근거", type: "experiment" },
            { id: "e-002", type: "survey" },
          ],
        }),
      },
    ];
    const result = extractCitationsFromToolResults(toolResults);
    // 1 discovery + 2 evidence
    expect(result).toHaveLength(3);
    const disc = result.filter((c) => c.type === "discovery");
    const evid = result.filter((c) => c.type === "evidence");
    expect(disc).toHaveLength(1);
    expect(evid).toHaveLength(2);
    expect(evid[0].title).toBe("실험 근거");
    // evidence without title falls back to type
    expect(evid[1].title).toBe("survey");
    expect(evid[0].url).toBe("/discoveries/d-001#evidence-e-001");
  });

  it("잘못된 JSON 스킵", () => {
    const toolResults: ToolCallResult[] = [
      { name: "broken", input: {}, result: "{invalid json" },
      {
        name: "get_discovery_detail",
        input: {},
        result: JSON.stringify({
          discovery: { id: "d-001", title: "정상 결과" },
        }),
      },
    ];
    const result = extractCitationsFromToolResults(toolResults);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("d-001");
  });

  it("관련 필드 없는 결과는 무시", () => {
    const toolResults: ToolCallResult[] = [
      {
        name: "get_metrics",
        input: {},
        result: JSON.stringify({ totalDiscoveries: 5, activeExperiments: 2 }),
      },
    ];
    const result = extractCitationsFromToolResults(toolResults);
    expect(result).toEqual([]);
  });

  it("복수 tool result에서 모든 인용 수집", () => {
    const toolResults: ToolCallResult[] = [
      {
        name: "get_discovery_detail",
        input: {},
        result: JSON.stringify({ discovery: { id: "d-001", title: "발견 A" } }),
      },
      {
        name: "list_proposals",
        input: {},
        result: JSON.stringify({ proposals: [{ id: "p-001", title: "제안 X" }] }),
      },
    ];
    const result = extractCitationsFromToolResults(toolResults);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("discovery");
    expect(result[1].type).toBe("proposal");
  });
});
