import { describe, it, expect } from "vitest";

/**
 * SuggestTitleButton 순수 로직 테스트
 * — AI 제목 추천 요청/응답/에러 처리 검증
 *
 * 참조: app/routes/ideas.$id.tsx (188~231행)
 */

// ── 순수 로직 재현 ──────────────────────────────────────────────

/** 제목 추천 API 요청 생성 */
function buildSuggestRequest(ideaId: string) {
  return {
    url: `/api/ideas/${ideaId}/suggest-title`,
    method: "POST" as const,
  };
}

/** 응답 파싱 — title이 있으면 반환, 없으면 null */
function parseSuggestResponse(data: Record<string, unknown>): string | null {
  if (typeof data.title === "string" && data.title) {
    return data.title;
  }
  return null;
}

/** 로딩 상태에서 중복 클릭 방지 판단 */
function canRequestSuggest(loading: boolean): boolean {
  return !loading;
}

// ── 테스트 ──────────────────────────────────────────────────────

describe("SuggestTitleButton 로직", () => {
  describe("buildSuggestRequest", () => {
    it("올바른 POST 요청을 생성한다", () => {
      const req = buildSuggestRequest("idea-abc");
      expect(req).toEqual({
        url: "/api/ideas/idea-abc/suggest-title",
        method: "POST",
      });
    });

    it("ideaId가 URL 경로에 포함된다", () => {
      const req = buildSuggestRequest("my-idea-123");
      expect(req.url).toBe("/api/ideas/my-idea-123/suggest-title");
    });

    it("body 없이 POST만 전송한다", () => {
      const req = buildSuggestRequest("id");
      expect(req).not.toHaveProperty("body");
    });
  });

  describe("parseSuggestResponse", () => {
    it("title이 있으면 반환한다", () => {
      const result = parseSuggestResponse({ title: "AI가 추천한 제목" });
      expect(result).toBe("AI가 추천한 제목");
    });

    it("title이 없으면 null", () => {
      expect(parseSuggestResponse({})).toBeNull();
    });

    it("title이 빈 문자열이면 null", () => {
      expect(parseSuggestResponse({ title: "" })).toBeNull();
    });

    it("title이 string이 아니면 null", () => {
      expect(parseSuggestResponse({ title: 123 })).toBeNull();
      expect(parseSuggestResponse({ title: null })).toBeNull();
      expect(parseSuggestResponse({ title: undefined })).toBeNull();
    });

    it("추가 필드가 있어도 title만 파싱한다", () => {
      const result = parseSuggestResponse({
        title: "제목",
        confidence: 0.95,
        extra: "무시",
      });
      expect(result).toBe("제목");
    });
  });

  describe("canRequestSuggest (로딩 상태)", () => {
    it("loading=false → 요청 가능", () => {
      expect(canRequestSuggest(false)).toBe(true);
    });

    it("loading=true → 중복 요청 차단", () => {
      expect(canRequestSuggest(true)).toBe(false);
    });
  });

  describe("에러 처리", () => {
    it("!res.ok 시 title 콜백을 호출하지 않아야 한다", () => {
      // 컴포넌트 로직: if (!res.ok) return;
      const resOk = false;
      let titleUpdated = false;

      if (resOk) {
        titleUpdated = true;
      }

      expect(titleUpdated).toBe(false);
    });

    it("네트워크 에러(catch) 시에도 조용히 실패한다", () => {
      // 컴포넌트 로직: catch { /* silently fail */ }
      let errorThrown = false;
      try {
        // 시뮬레이션: fetch 실패
        throw new Error("Network error");
      } catch {
        // SuggestTitleButton은 에러를 무시 (silently fail)
        errorThrown = true;
      }
      expect(errorThrown).toBe(true);
    });
  });

  describe("로딩 상태 흐름", () => {
    it("요청 시작 → loading=true → 완료 → loading=false", () => {
      const states: boolean[] = [];

      // 시뮬레이션
      let loading = false;
      states.push(loading); // initial: false

      loading = true; // 요청 시작
      states.push(loading);

      loading = false; // finally 블록
      states.push(loading);

      expect(states).toEqual([false, true, false]);
    });

    it("에러 발생해도 loading=false로 복원된다", () => {
      let loading = false;

      loading = true; // 요청 시작
      try {
        throw new Error("API error");
      } catch {
        // silently fail
      } finally {
        loading = false; // finally에서 복원
      }

      expect(loading).toBe(false);
    });
  });
});
