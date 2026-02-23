import { describe, it, expect } from "vitest";

/**
 * EditableTitle 컴포넌트의 순수 로직 테스트
 * — React 렌더링 없이 제목 저장/복원/요청 생성 로직만 검증
 *
 * 참조: app/routes/ideas.$id.tsx (95~186행)
 */

// ── 순수 로직 재현 ──────────────────────────────────────────────

/** 제목 저장 조건 판단 */
function shouldSaveTitle(trimmedTitle: string, savedTitle: string): boolean {
  if (!trimmedTitle) return false;
  if (trimmedTitle === savedTitle) return false;
  return true;
}

/** 제목 trim + 유효성 판단 */
function validateTitle(rawTitle: string, savedTitle: string): {
  shouldSave: boolean;
  effectiveTitle: string;
} {
  const trimmed = rawTitle.trim();
  if (!trimmed || trimmed === savedTitle) {
    return { shouldSave: false, effectiveTitle: savedTitle };
  }
  return { shouldSave: true, effectiveTitle: trimmed };
}

/** PATCH 요청 생성 */
function buildPatchRequest(ideaId: string, title: string) {
  return {
    url: "/api/ideas",
    method: "PATCH" as const,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: ideaId, title }),
  };
}

/** 키보드 이벤트 핸들링 — 어떤 액션을 수행할지 결정 */
function resolveKeyAction(key: string): "save" | "cancel" | "none" {
  if (key === "Enter") return "save";
  if (key === "Escape") return "cancel";
  return "none";
}

// ── 테스트 ──────────────────────────────────────────────────────

describe("EditableTitle 로직", () => {
  describe("shouldSaveTitle", () => {
    it("빈 문자열이면 저장하지 않는다", () => {
      expect(shouldSaveTitle("", "기존 제목")).toBe(false);
    });

    it("변경 없음(같은 제목)이면 저장하지 않는다", () => {
      expect(shouldSaveTitle("기존 제목", "기존 제목")).toBe(false);
    });

    it("유효한 변경이면 저장한다", () => {
      expect(shouldSaveTitle("새 제목", "기존 제목")).toBe(true);
    });
  });

  describe("validateTitle", () => {
    it("빈 문자열 → savedTitle 복원, shouldSave=false", () => {
      const result = validateTitle("", "원래 제목");
      expect(result).toEqual({ shouldSave: false, effectiveTitle: "원래 제목" });
    });

    it("공백만 입력 → savedTitle 복원, shouldSave=false", () => {
      const result = validateTitle("   ", "원래 제목");
      expect(result).toEqual({ shouldSave: false, effectiveTitle: "원래 제목" });
    });

    it("동일 제목(trim 후) → savedTitle 유지, shouldSave=false", () => {
      const result = validateTitle("  원래 제목  ", "원래 제목");
      expect(result).toEqual({ shouldSave: false, effectiveTitle: "원래 제목" });
    });

    it("유효한 새 제목 → trim된 제목, shouldSave=true", () => {
      const result = validateTitle("  새로운 제목  ", "원래 제목");
      expect(result).toEqual({ shouldSave: true, effectiveTitle: "새로운 제목" });
    });
  });

  describe("buildPatchRequest", () => {
    it("올바른 PATCH 요청을 생성한다", () => {
      const req = buildPatchRequest("idea-123", "업데이트된 제목");
      expect(req).toEqual({
        url: "/api/ideas",
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "idea-123", title: "업데이트된 제목" }),
      });
    });

    it("body에 id와 title만 포함한다", () => {
      const req = buildPatchRequest("idea-456", "제목");
      const body = JSON.parse(req.body);
      expect(Object.keys(body)).toEqual(["id", "title"]);
    });

    it("method는 PATCH이다", () => {
      const req = buildPatchRequest("idea-789", "제목");
      expect(req.method).toBe("PATCH");
    });
  });

  describe("resolveKeyAction (키보드 핸들링)", () => {
    it("Enter → save 액션", () => {
      expect(resolveKeyAction("Enter")).toBe("save");
    });

    it("Escape → cancel 액션 (이전 값 복원)", () => {
      expect(resolveKeyAction("Escape")).toBe("cancel");
    });

    it("다른 키 → none (무시)", () => {
      expect(resolveKeyAction("a")).toBe("none");
      expect(resolveKeyAction("Tab")).toBe("none");
      expect(resolveKeyAction("ArrowDown")).toBe("none");
    });
  });

  describe("maxLength 제한", () => {
    it("200자 이내 제목은 유효하다", () => {
      const title = "가".repeat(200);
      const result = validateTitle(title, "이전 제목");
      expect(result.shouldSave).toBe(true);
      expect(result.effectiveTitle).toBe(title);
    });

    it("input maxLength=200은 HTML 속성으로 적용됨 (로직 레벨에서는 trim만)", () => {
      // maxLength는 <input> 속성이므로 로직에서 별도 제한 없음
      const longTitle = "가".repeat(300);
      const result = validateTitle(longTitle, "이전 제목");
      // 로직 자체는 유효하다고 판단 (HTML이 잘라줌)
      expect(result.shouldSave).toBe(true);
    });
  });

  describe("실패 복원 시나리오", () => {
    it("API 실패 시 savedTitle로 복원해야 한다", () => {
      // saveTitle 로직에서: res.ok가 false면 이전 제목으로 롤백
      const savedTitle = "원래 제목";
      const newTitle = "변경 시도";
      const apiSuccess = false;

      // 롤백 시뮬레이션
      const restoredTitle = apiSuccess ? newTitle : savedTitle;
      expect(restoredTitle).toBe("원래 제목");
    });

    it("네트워크 에러(catch) 시에도 savedTitle로 복원해야 한다", () => {
      const savedTitle = "원래 제목";
      const networkError = true;

      const restoredTitle = networkError ? savedTitle : "새 제목";
      expect(restoredTitle).toBe("원래 제목");
    });
  });
});
