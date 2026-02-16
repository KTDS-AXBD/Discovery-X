/**
 * validateGraph 테스트
 *
 * 테스트 대상:
 * - validateJsonLd(): JSON-LD 최상위 구조 검증
 * - validateContext(): dx 네임스페이스 검증
 * - validateNodes(): @id/@type 필수 + 허용 @type + dx: prefix 경고
 * - validateGraph(): 통합 검증
 */

import { describe, it, expect } from "vitest";
import {
  validateJsonLd,
  validateContext,
  validateNodes,
  validateGraph,
} from "~/lib/graph/validator";
import type { JsonLdGraph, JsonLdNode } from "~/lib/graph/types";

// ─── 테스트 ─────────────────────────────────────────────────────────────

describe("validateJsonLd", () => {
  it("유효한 JSON-LD → valid:true", () => {
    const result = validateJsonLd({
      "@context": { dx: "https://discovery-x.io/ns/" },
      "@graph": [],
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("비객체 입력 → errors", () => {
    expect(validateJsonLd(null).valid).toBe(false);
    expect(validateJsonLd("string").valid).toBe(false);
    expect(validateJsonLd(42).valid).toBe(false);
    expect(validateJsonLd([]).valid).toBe(false);
  });

  it("@context 누락 → errors", () => {
    const result = validateJsonLd({ "@graph": [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("@context"))).toBe(true);
  });

  it("@graph 누락 → errors", () => {
    const result = validateJsonLd({ "@context": { dx: "..." } });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("@graph"))).toBe(true);
  });

  it("@graph가 배열이 아니면 → errors", () => {
    const result = validateJsonLd({
      "@context": { dx: "..." },
      "@graph": "not-array",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("배열"))).toBe(true);
  });
});

describe("validateContext", () => {
  it("dx 네임스페이스 존재 → valid:true", () => {
    const graph: JsonLdGraph = {
      "@context": { dx: "https://discovery-x.io/ns/" },
      "@graph": [],
    };
    const result = validateContext(graph);
    expect(result.valid).toBe(true);
  });

  it("dx 네임스페이스 부재 → errors", () => {
    const graph: JsonLdGraph = {
      "@context": { schema: "https://schema.org/" } as Record<string, unknown>,
      "@graph": [],
    };
    const result = validateContext(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("dx"))).toBe(true);
  });

  it("@context가 객체가 아닌 경우 → errors", () => {
    const graph = {
      "@context": "https://schema.org/",
      "@graph": [],
    } as unknown as JsonLdGraph;
    const result = validateContext(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("객체"))).toBe(true);
  });
});

describe("validateNodes", () => {
  it("유효한 노드 → valid:true", () => {
    const nodes: JsonLdNode[] = [
      { "@id": "dx:user-1", "@type": "dx:User" },
      { "@id": "dx:topic-1", "@type": "dx:Topic" },
    ];
    const result = validateNodes(nodes);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("@id 누락 → error", () => {
    const nodes = [{ "@type": "dx:User" }] as unknown as JsonLdNode[];
    const result = validateNodes(nodes);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("@id"))).toBe(true);
  });

  it("@type 누락 → error", () => {
    const nodes = [{ "@id": "dx:test" }] as unknown as JsonLdNode[];
    const result = validateNodes(nodes);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("@type"))).toBe(true);
  });

  it("허용되지 않는 @type → error", () => {
    const nodes: JsonLdNode[] = [
      { "@id": "dx:custom-1", "@type": "dx:CustomUnknownType" },
    ];
    const result = validateNodes(nodes);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("허용되지 않는"))).toBe(true);
  });

  it("dx: prefix 없는 @id → warning (valid는 true)", () => {
    const nodes: JsonLdNode[] = [
      { "@id": "user-no-prefix", "@type": "dx:User" },
    ];
    const result = validateNodes(nodes);
    expect(result.valid).toBe(true); // warning은 valid에 영향 없음
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some((w) => w.includes("dx:"))).toBe(true);
  });

  it("빈 배열 → valid:true", () => {
    const result = validateNodes([]);
    expect(result.valid).toBe(true);
  });
});

describe("validateGraph", () => {
  it("완전히 유효한 Graph → valid:true", () => {
    const result = validateGraph({
      "@context": { dx: "https://discovery-x.io/ns/" },
      "@graph": [
        { "@id": "dx:u-1", "@type": "dx:User", "dx:name": "테스트" },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("통합 검증: 모든 단계의 에러 수집", () => {
    // @context에 dx 없고, 노드에 @id 없음
    const result = validateGraph({
      "@context": { schema: "https://schema.org/" },
      "@graph": [{ "@type": "dx:User" }],
    });
    expect(result.valid).toBe(false);
    // @context 에러 + @id 에러 모두 포함
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors.some((e) => e.includes("dx"))).toBe(true);
    expect(result.errors.some((e) => e.includes("@id"))).toBe(true);
  });

  it("구조 불량이면 조기 반환 (노드 검증 스킵)", () => {
    const result = validateGraph("not-an-object");
    expect(result.valid).toBe(false);
    // 구조 에러만 있고, 노드 에러는 없음
    expect(result.errors.some((e) => e.includes("객체"))).toBe(true);
  });

  it("빈 @graph → valid:true (노드 0개 허용)", () => {
    const result = validateGraph({
      "@context": { dx: "https://discovery-x.io/ns/" },
      "@graph": [],
    });
    expect(result.valid).toBe(true);
  });

  it("warnings도 수집", () => {
    const result = validateGraph({
      "@context": { dx: "https://discovery-x.io/ns/" },
      "@graph": [
        { "@id": "no-prefix-id", "@type": "dx:User" },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.length).toBeGreaterThan(0);
  });
});
