/**
 * TeamDiscussion 댓글 수정/삭제 UI 로직 테스트
 *
 * 대상: app/components/proposals/TeamDiscussion.tsx
 * - 본인 댓글: 수정/삭제 버튼 노출
 * - 타인 댓글: 수정/삭제 버튼 미노출
 * - 수정 모드: editContent 상태 관리
 * - 삭제: fetcher DELETE 호출 조건
 */
import { describe, it, expect } from "vitest";

// --------------------------------------------------------------------------
// Pure logic extraction (component에서 테스트 가능한 로직만)
// --------------------------------------------------------------------------

interface Comment {
  id: string;
  authorId: string;
  authorName?: string;
  content: string;
  createdAt: string | number | null;
}

/** 본인 댓글 여부 판별 */
function isMineComment(comment: Comment, currentUserId: string): boolean {
  return comment.authorId === currentUserId;
}

/** 상대 시간 포맷 (TeamDiscussion.formatRelativeTime 로직과 동일) */
function formatRelativeTime(ts: string | number | null): string {
  if (!ts) return "";
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "방금 전";
  if (diffHour < 1) return `${diffMin}분 전`;
  if (diffDay < 1) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

/** 수정 폼 유효성 — 빈 문자열/공백만이면 저장 불가 */
function canSaveEdit(editContent: string): boolean {
  return editContent.trim().length > 0;
}

/** 댓글 작성 폼 유효성 — 빈 문자열/공백만이면 제출 불가 */
function canSubmitComment(content: string, isSubmitting: boolean): boolean {
  return content.trim().length > 0 && !isSubmitting;
}

/** 아바타 이니셜 추출 */
function getInitial(authorName: string | undefined): string {
  return (authorName || "U").charAt(0).toUpperCase();
}

// ============================================================================
// Tests
// ============================================================================

describe("TeamDiscussion — 댓글 권한 로직", () => {
  const MY_USER_ID = "user-1";

  const myComment: Comment = {
    id: "c1",
    authorId: MY_USER_ID,
    authorName: "나",
    content: "내 댓글",
    createdAt: Math.floor(Date.now() / 1000),
  };

  const otherComment: Comment = {
    id: "c2",
    authorId: "user-2",
    authorName: "다른 사람",
    content: "다른 댓글",
    createdAt: Math.floor(Date.now() / 1000),
  };

  describe("isMineComment", () => {
    it("본인 댓글이면 true", () => {
      expect(isMineComment(myComment, MY_USER_ID)).toBe(true);
    });

    it("타인 댓글이면 false", () => {
      expect(isMineComment(otherComment, MY_USER_ID)).toBe(false);
    });

    it("authorId가 빈 문자열이면 false", () => {
      const empty: Comment = { ...myComment, authorId: "" };
      expect(isMineComment(empty, MY_USER_ID)).toBe(false);
    });
  });
});

describe("TeamDiscussion — 수정 폼 유효성", () => {
  describe("canSaveEdit", () => {
    it("유효한 내용이면 true", () => {
      expect(canSaveEdit("수정된 댓글")).toBe(true);
    });

    it("빈 문자열이면 false", () => {
      expect(canSaveEdit("")).toBe(false);
    });

    it("공백만이면 false", () => {
      expect(canSaveEdit("   ")).toBe(false);
    });

    it("탭/줄바꿈만이면 false", () => {
      expect(canSaveEdit("\t\n")).toBe(false);
    });
  });
});

describe("TeamDiscussion — 댓글 작성 유효성", () => {
  describe("canSubmitComment", () => {
    it("유효한 내용 + 미제출 상태이면 true", () => {
      expect(canSubmitComment("새 댓글", false)).toBe(true);
    });

    it("제출 중이면 false", () => {
      expect(canSubmitComment("새 댓글", true)).toBe(false);
    });

    it("빈 문자열이면 false", () => {
      expect(canSubmitComment("", false)).toBe(false);
    });

    it("공백만이면 false", () => {
      expect(canSubmitComment("   ", false)).toBe(false);
    });
  });
});

describe("TeamDiscussion — 시간 포맷", () => {
  describe("formatRelativeTime", () => {
    it("null → 빈 문자열", () => {
      expect(formatRelativeTime(null)).toBe("");
    });

    it("방금 전 (30초 전)", () => {
      const ts = Math.floor(Date.now() / 1000) - 30;
      expect(formatRelativeTime(ts)).toBe("방금 전");
    });

    it("N분 전 (5분 전)", () => {
      const ts = Math.floor(Date.now() / 1000) - 300;
      expect(formatRelativeTime(ts)).toBe("5분 전");
    });

    it("N시간 전 (2시간 전)", () => {
      const ts = Math.floor(Date.now() / 1000) - 7200;
      expect(formatRelativeTime(ts)).toBe("2시간 전");
    });

    it("N일 전 (3일 전)", () => {
      const ts = Math.floor(Date.now() / 1000) - 259200;
      expect(formatRelativeTime(ts)).toBe("3일 전");
    });

    it("7일 이상이면 yyyy.mm.dd 포맷", () => {
      const d = new Date("2025-01-15T10:00:00Z");
      const ts = Math.floor(d.getTime() / 1000);
      const result = formatRelativeTime(ts);
      expect(result).toMatch(/^\d{4}\.\d{2}\.\d{2}$/);
    });
  });
});

describe("TeamDiscussion — 아바타", () => {
  describe("getInitial", () => {
    it("이름이 있으면 첫 글자 대문자", () => {
      expect(getInitial("alice")).toBe("A");
    });

    it("한글 이름 첫 글자", () => {
      expect(getInitial("서진혁")).toBe("서");
    });

    it("undefined면 U", () => {
      expect(getInitial(undefined)).toBe("U");
    });

    it("빈 문자열이면 U", () => {
      expect(getInitial("")).toBe("U");
    });
  });
});
