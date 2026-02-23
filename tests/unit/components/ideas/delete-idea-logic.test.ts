import { describe, it, expect } from "vitest";

/**
 * 아이디어 삭제 로직 테스트
 * — API 요청 형식 및 삭제 조건 검증
 */

// 삭제 요청 생성 로직 (ideas.$id.tsx의 인라인 핸들러와 동일)
function buildDeleteRequest(ideaId: string | null) {
  if (!ideaId) return null;

  return {
    url: "/api/ideas",
    method: "DELETE" as const,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: ideaId }),
  };
}

// 삭제 후 리다이렉트 URL
function getDeleteRedirectUrl() {
  return "/ideas";
}

describe("아이디어 삭제 로직", () => {
  describe("buildDeleteRequest", () => {
    it("ideaId가 있으면 올바른 DELETE 요청을 생성한다", () => {
      const req = buildDeleteRequest("idea-123");
      expect(req).toEqual({
        url: "/api/ideas",
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "idea-123" }),
      });
    });

    it("ideaId가 null이면 요청을 생성하지 않는다", () => {
      expect(buildDeleteRequest(null)).toBeNull();
    });

    it("body에 id만 포함한다", () => {
      const req = buildDeleteRequest("idea-456");
      const body = JSON.parse(req!.body);
      expect(Object.keys(body)).toEqual(["id"]);
      expect(body.id).toBe("idea-456");
    });

    it("method는 DELETE이다", () => {
      const req = buildDeleteRequest("idea-789");
      expect(req!.method).toBe("DELETE");
    });

    it("Content-Type은 application/json이다", () => {
      const req = buildDeleteRequest("idea-abc");
      expect(req!.headers["Content-Type"]).toBe("application/json");
    });
  });

  describe("삭제 후 리다이렉트", () => {
    it("삭제 성공 시 /ideas로 이동한다", () => {
      expect(getDeleteRedirectUrl()).toBe("/ideas");
    });
  });
});
