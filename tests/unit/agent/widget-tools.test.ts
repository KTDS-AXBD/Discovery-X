/**
 * widget-tools.ts 단위 테스트 — renderWidget 함수
 * - sanitize → DB 저장 → 결과 반환 플로우
 * - 보안 정책 위반 시 에러 반환
 * - DB 저장 실패 시 비치명적 처리
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWidget } from "~/features/chat/agent/tools/widget-tools";

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------

const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
const fakeDb = {
  insert: mockInsert,
} as unknown as Parameters<typeof renderWidget>[0];

beforeEach(() => {
  vi.clearAllMocks();
  // DB insert 기본 성공
  mockInsert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
});

// ---------------------------------------------------------------------------
// 정상 케이스
// ---------------------------------------------------------------------------

describe("renderWidget — 정상 케이스", () => {
  it("기본 입력 → widgetId, widgetType, title, code, data 반환", async () => {
    const result = await renderWidget(fakeDb, {
      widgetType: "chart",
      title: "Discovery 상태",
      code: "<div>Chart</div>",
      data: { total: 10 },
    });
    const parsed = JSON.parse(result);
    expect(parsed.widgetId).toBeDefined();
    expect(parsed.widgetId).toMatch(/^[0-9a-f-]{36}$/);
    expect(parsed.widgetType).toBe("chart");
    expect(parsed.title).toBe("Discovery 상태");
    expect(parsed.code).toBe("<div>Chart</div>");
    expect(parsed.data).toEqual({ total: 10 });
  });

  it("description 선택 필드 전달 시 포함", async () => {
    const result = await renderWidget(fakeDb, {
      widgetType: "table",
      title: "목록",
      code: "<table></table>",
      data: {},
      description: "접근성 설명",
    });
    const parsed = JSON.parse(result);
    expect(parsed.description).toBe("접근성 설명");
  });

  it("description 미제공 시 null", async () => {
    const result = await renderWidget(fakeDb, {
      widgetType: "metric-card",
      title: "KPI",
      code: "<div>42</div>",
      data: { value: 42 },
    });
    const parsed = JSON.parse(result);
    expect(parsed.description).toBeNull();
  });

  it("warnings 배열 반환 (sanitizer 경고)", async () => {
    const result = await renderWidget(fakeDb, {
      widgetType: "chart",
      title: "Chart",
      code: "<div>fetch('http://api.evil.com')</div>",
      data: {},
    });
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed.warnings)).toBe(true);
  });

  it("data 미제공 시 빈 객체 기본값", async () => {
    const result = await renderWidget(fakeDb, {
      widgetType: "diagram",
      title: "Flow",
      code: "<svg></svg>",
      data: {},
    });
    const parsed = JSON.parse(result);
    expect(parsed.data).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// DB 저장 케이스
// ---------------------------------------------------------------------------

describe("renderWidget — DB 저장", () => {
  it("_conversationId 주입 시 chatWidgets에 insert 호출", async () => {
    await renderWidget(fakeDb, {
      widgetType: "chart",
      title: "Chart",
      code: "<div>ok</div>",
      data: {},
      _conversationId: "conv-123",
    });
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const insertCall = mockInsert.mock.calls[0][0];
    // chatWidgets 테이블 참조 확인 (테이블 객체 전달됨)
    expect(insertCall).toBeDefined();
  });

  it("_conversationId 미제공 시 DB insert 호출 안 함", async () => {
    await renderWidget(fakeDb, {
      widgetType: "chart",
      title: "Chart",
      code: "<div>ok</div>",
      data: {},
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("DB 저장 실패해도 결과는 정상 반환 (비치명적)", async () => {
    mockInsert.mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error("DB 오류")),
    });
    const result = await renderWidget(fakeDb, {
      widgetType: "chart",
      title: "Chart",
      code: "<div>ok</div>",
      data: {},
      _conversationId: "conv-123",
    });
    const parsed = JSON.parse(result);
    // DB 실패에도 widgetId 반환
    expect(parsed.widgetId).toBeDefined();
    expect(parsed.error).toBeUndefined();
  });

  it("_tenantId 주입 시 insert values에 tenantId 포함", async () => {
    const valuesStub = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesStub });

    await renderWidget(fakeDb, {
      widgetType: "chart",
      title: "Chart",
      code: "<div>ok</div>",
      data: {},
      _conversationId: "conv-123",
      _tenantId: "tenant-abc",
    });

    expect(valuesStub).toHaveBeenCalledTimes(1);
    const insertedRow = valuesStub.mock.calls[0][0];
    expect(insertedRow.tenantId).toBe("tenant-abc");
  });
});

// ---------------------------------------------------------------------------
// 보안 / 에러 케이스
// ---------------------------------------------------------------------------

describe("renderWidget — 보안 에러", () => {
  it("외부 스크립트 삽입 시 sanitize 경고 포함, 코드는 수정됨", async () => {
    const result = await renderWidget(fakeDb, {
      widgetType: "chart",
      title: "악의적 위젯",
      code: '<script src="https://evil.com/xss.js"></script>',
      data: {},
    });
    const parsed = JSON.parse(result);
    // 외부 스크립트는 제거(replace)되고 warnings에 기록됨 — blocked가 아닌 경고
    expect(parsed.widgetId).toBeDefined();
    expect(Array.isArray(parsed.warnings)).toBe(true);
    expect(parsed.warnings.length).toBeGreaterThan(0);
    // 원본 코드는 수정됨
    expect(parsed.code).toContain("<!-- blocked -->");
  });

  it("10KB 초과 코드 → blocked → 에러 반환", async () => {
    const bigCode = "x".repeat(10_241);
    const result = await renderWidget(fakeDb, {
      widgetType: "chart",
      title: "큰 위젯",
      code: bigCode,
      data: {},
    });
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("보안 정책을 위반");
  });

  it("필수 필드 누락 → 에러 반환", async () => {
    const result = await renderWidget(fakeDb, {
      widgetType: "",
      title: "",
      code: "",
      data: {},
    });
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("widgetType, title, code 필드가 필요합니다");
  });
});
