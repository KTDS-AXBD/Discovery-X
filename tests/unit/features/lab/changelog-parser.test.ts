import { describe, it, expect, beforeAll } from "vitest";
import {
  parseChangelog,
  queryChangelog,
  type ChangelogSession,
} from "~/features/lab/service/changelog-parser";

// --- Fixture ---

const SAMPLE_CHANGELOG = `# CHANGELOG — Session History

> SPEC.md에서 분리된 세션 변경 이력.

### 세션 408 (2026-03-17)
**F46 Phase 4 — 스킬 엔진 통합 테스트 + F46 DONE (DX-REQ-016)**:
- ✅ **유닛 테스트**: skill-catalog-service.test.ts (10개)
- ✅ **API 통합 테스트**: api-ideas-skills.test.ts (16개)
- ✅ **Agent Team** (W1: 서비스 유닛, W2: API 통합)
- ⚠️ **프로덕션 미적용**: 마이그레이션 0065

**검증 결과**:
- ✅ typecheck (0 errors) / tests (43/43 new)

### 세션 407 (2026-03-17)
**거버넌스 점검 + wrangler 다중 계정 문제 해결**:
- ✅ **GOV check**: 15개 거버넌스 표준 점검 — 13/15
- ✅ **D1 마이그레이션 drift 수정**: 0065 동기화
- ℹ️ MEMORY.md 정리

**검증 결과**:
- ⏭️ typecheck/lint/test: 설정 파일 변경만이라 건너뜀

### 세션 400 (2026-03-14)
**PRD Studio 프로덕션 버그 수정 + SSE 실시간 분석 (DX-REQ-015, F44)**:
- ✅ **500 에러 수정**: 마이그레이션 0063~0064 프로덕션 미적용
- ✅ **SSE 실시간 분석**: 큐+배치 → SSE 스트리밍

**검증 결과**:
- ✅ typecheck / lint / 2,585 tests PASS / build / Playwright E2E
`;

const SUFFIX_CHANGELOG = `### 세션 393b (2026-03-10)
**PRD Studio 개선 (후속)**:
- ✅ 추가 수정사항
- Agent Team 2 Workers:

### 세션 393 (2026-03-10)
**PRD Studio 기본 구현**:
- ✅ 기본 구현 완료
`;

// --- Tests ---

describe("parseChangelog", () => {
  it("세션 3개를 올바르게 파싱한다", () => {
    const result = parseChangelog(SAMPLE_CHANGELOG);
    expect(result.totalCount).toBe(3);
    expect(result.sessions.map((s) => s.id)).toEqual(["408", "407", "400"]);
  });

  it("세션 헤더에서 ID와 날짜를 추출한다", () => {
    const result = parseChangelog(SAMPLE_CHANGELOG);
    const s408 = result.sessions[0];
    expect(s408.id).toBe("408");
    expect(s408.numericId).toBe(408);
    expect(s408.date).toBe("2026-03-17");
  });

  it("세션 제목을 추출한다", () => {
    const result = parseChangelog(SAMPLE_CHANGELOG);
    expect(result.sessions[0].title).toBe(
      "F46 Phase 4 — 스킬 엔진 통합 테스트 + F46 DONE (DX-REQ-016)"
    );
    expect(result.sessions[1].title).toBe(
      "거버넌스 점검 + wrangler 다중 계정 문제 해결"
    );
  });

  it("작업 항목을 상태와 함께 파싱한다", () => {
    const result = parseChangelog(SAMPLE_CHANGELOG);
    const items = result.sessions[0].items;
    expect(items).toHaveLength(4);
    expect(items[0]).toEqual({
      status: "done",
      text: "**유닛 테스트**: skill-catalog-service.test.ts (10개)",
    });
    expect(items[3]).toEqual({
      status: "warning",
      text: "**프로덕션 미적용**: 마이그레이션 0065",
    });
  });

  it("검증 결과를 별도로 파싱한다", () => {
    const result = parseChangelog(SAMPLE_CHANGELOG);
    const v408 = result.sessions[0].verification;
    expect(v408).toHaveLength(1);
    expect(v408[0].status).toBe("done");

    const v407 = result.sessions[1].verification;
    expect(v407).toHaveLength(1);
    expect(v407[0].status).toBe("skipped");
  });

  it("F항목 번호를 자동 추출한다", () => {
    const result = parseChangelog(SAMPLE_CHANGELOG);
    expect(result.sessions[0].fItems).toEqual([46]);
    expect(result.sessions[2].fItems).toEqual([44]);
  });

  it("REQ 코드를 자동 추출한다", () => {
    const result = parseChangelog(SAMPLE_CHANGELOG);
    expect(result.sessions[0].reqCodes).toEqual(["DX-REQ-016"]);
    expect(result.sessions[2].reqCodes).toEqual(["DX-REQ-015"]);
  });

  it("F항목/REQ이 없는 세션은 빈 배열을 반환한다", () => {
    const result = parseChangelog(SAMPLE_CHANGELOG);
    expect(result.sessions[1].fItems).toEqual([]);
    expect(result.sessions[1].reqCodes).toEqual([]);
  });

  it("ℹ️ 상태를 info로 파싱한다", () => {
    const result = parseChangelog(SAMPLE_CHANGELOG);
    const infoItems = result.sessions[1].items.filter(
      (i) => i.status === "info"
    );
    expect(infoItems).toHaveLength(1);
    expect(infoItems[0].text).toContain("MEMORY.md");
  });

  it("빈 문자열을 파싱하면 0개 세션을 반환한다", () => {
    const result = parseChangelog("");
    expect(result.totalCount).toBe(0);
    expect(result.sessions).toEqual([]);
  });

  it("헤더만 있고 내용 없는 세션도 파싱한다", () => {
    const result = parseChangelog("### 세션 999 (2026-01-01)\n");
    expect(result.totalCount).toBe(1);
    expect(result.sessions[0].id).toBe("999");
    expect(result.sessions[0].numericId).toBe(999);
    expect(result.sessions[0].title).toBe("");
    expect(result.sessions[0].items).toEqual([]);
  });

  // --- 접미사 세션 테스트 ---

  it("접미사(b,c,g) 포함 세션을 파싱한다", () => {
    const result = parseChangelog(SUFFIX_CHANGELOG);
    expect(result.totalCount).toBe(2);
    expect(result.sessions[0].id).toBe("393b");
    expect(result.sessions[0].numericId).toBe(393);
    expect(result.sessions[1].id).toBe("393");
  });

  it("접미사 세션은 고유한 ID를 가진다", () => {
    const result = parseChangelog(SUFFIX_CHANGELOG);
    const ids = result.sessions.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // --- 이모지 없는 불릿 테스트 ---

  it("이모지 없는 불릿을 info 상태로 파싱한다", () => {
    const result = parseChangelog(SUFFIX_CHANGELOG);
    const s393b = result.sessions[0];
    // "Agent Team 2 Workers:" 는 이모지 없는 불릿
    const plainItems = s393b.items.filter(
      (i) => i.text === "Agent Team 2 Workers:"
    );
    expect(plainItems).toHaveLength(1);
    expect(plainItems[0].status).toBe("info");
  });

  it("이모지 있는 불릿과 없는 불릿이 혼합되어도 모두 파싱한다", () => {
    const result = parseChangelog(SUFFIX_CHANGELOG);
    const s393b = result.sessions[0];
    expect(s393b.items).toHaveLength(2); // ✅ 1개 + plain 1개
  });
});

describe("queryChangelog", () => {
  let parsed: ReturnType<typeof parseChangelog>;

  beforeAll(() => {
    parsed = parseChangelog(SAMPLE_CHANGELOG);
  });

  it("기본 페이지네이션 (page=0, pageSize=10)", () => {
    const result = queryChangelog(parsed);
    expect(result.sessions).toHaveLength(3);
    expect(result.total).toBe(3);
    expect(result.page).toBe(0);
    expect(result.pageSize).toBe(10);
  });

  it("페이지 크기 제한", () => {
    const result = queryChangelog(parsed, { pageSize: 2 });
    expect(result.sessions).toHaveLength(2);
    expect(result.total).toBe(3);
    expect(result.sessions[0].id).toBe("408");
    expect(result.sessions[1].id).toBe("407");
  });

  it("2번째 페이지 조회", () => {
    const result = queryChangelog(parsed, { page: 1, pageSize: 2 });
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].id).toBe("400");
  });

  it("F항목 필터", () => {
    const result = queryChangelog(parsed, { filter: { fItem: 46 } });
    expect(result.total).toBe(1);
    expect(result.sessions[0].id).toBe("408");
  });

  it("날짜 범위 필터 (dateFrom)", () => {
    const result = queryChangelog(parsed, {
      filter: { dateFrom: "2026-03-17" },
    });
    expect(result.total).toBe(2);
    expect(result.sessions.map((s) => s.id)).toEqual(["408", "407"]);
  });

  it("날짜 범위 필터 (dateTo)", () => {
    const result = queryChangelog(parsed, {
      filter: { dateTo: "2026-03-14" },
    });
    expect(result.total).toBe(1);
    expect(result.sessions[0].id).toBe("400");
  });

  it("텍스트 검색 필터", () => {
    const result = queryChangelog(parsed, {
      filter: { search: "거버넌스" },
    });
    expect(result.total).toBe(1);
    expect(result.sessions[0].id).toBe("407");
  });

  it("복합 필터 (날짜 + F항목)", () => {
    const result = queryChangelog(parsed, {
      filter: { dateFrom: "2026-03-14", fItem: 44 },
    });
    expect(result.total).toBe(1);
    expect(result.sessions[0].id).toBe("400");
  });

  it("일치하는 결과가 없으면 빈 배열 반환", () => {
    const result = queryChangelog(parsed, {
      filter: { search: "존재하지않는키워드" },
    });
    expect(result.total).toBe(0);
    expect(result.sessions).toEqual([]);
  });
});
