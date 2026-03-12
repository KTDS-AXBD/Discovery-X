import { describe, it, expect } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatDateLocalTime,
  formatTime,
} from "~/lib/format-date";

describe("format-date (KST 고정 타임존)", () => {
  // 2026-03-12T15:30:00Z = 2026-03-13 00:30 KST
  const UTC_ISO = "2026-03-12T15:30:00Z";

  describe("formatDate", () => {
    it("KST 날짜 포맷 (날짜 경계 확인)", () => {
      // UTC 15:30 → KST 다음날 00:30
      expect(formatDate(UTC_ISO)).toBe("2026. 3. 13.");
    });

    it("null/undefined → '-'", () => {
      expect(formatDate(null)).toBe("-");
      expect(formatDate(undefined)).toBe("-");
    });

    it("잘못된 문자열 → '-'", () => {
      expect(formatDate("not-a-date")).toBe("-");
    });
  });

  describe("formatDateTime", () => {
    it("KST 날짜+시간 포맷", () => {
      expect(formatDateTime(UTC_ISO)).toBe("3월 13일 00:30");
    });
  });

  describe("formatDateLocalTime", () => {
    it("KST YYYY-MM-DD HH:mm 포맷", () => {
      expect(formatDateLocalTime(UTC_ISO)).toBe("2026-03-13 00:30");
    });

    it("Date 객체 입력", () => {
      expect(formatDateLocalTime(new Date(UTC_ISO))).toBe("2026-03-13 00:30");
    });

    it("자정 이전 UTC → KST 같은 날", () => {
      // UTC 01:00 → KST 10:00 (같은 날)
      expect(formatDateLocalTime("2026-03-12T01:00:00Z")).toBe("2026-03-12 10:00");
    });
  });

  describe("formatTime", () => {
    it("KST 시간만 포맷", () => {
      expect(formatTime(UTC_ISO)).toBe("00:30");
    });
  });
});
