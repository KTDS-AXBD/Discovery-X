import { describe, it, expect } from "vitest";
import {
  classifyError,
  getEffectiveMaxRetries,
  type ErrorClassification,
} from "~/features/venture/utils/error-classifier";

describe("error-classifier", () => {
  describe("classifyError", () => {
    describe("retryable errors (일시적 오류)", () => {
      it("5xx 에러는 retryable", () => {
        expect(classifyError("500 Internal Server Error")).toBe("retryable");
        expect(classifyError("502 Bad Gateway")).toBe("retryable");
        expect(classifyError("503 Service Unavailable")).toBe("retryable");
      });

      it("429 rate limit은 retryable", () => {
        expect(classifyError("429 Too Many Requests")).toBe("retryable");
        expect(classifyError("Rate limit exceeded")).toBe("retryable");
      });

      it("타임아웃은 retryable", () => {
        expect(classifyError("Request timeout")).toBe("retryable");
        expect(classifyError("ETIMEDOUT")).toBe("retryable");
        expect(classifyError("Operation timed out")).toBe("retryable");
      });

      it("네트워크 에러는 retryable", () => {
        expect(classifyError("ECONNRESET")).toBe("retryable");
        expect(classifyError("ECONNREFUSED")).toBe("retryable");
        expect(classifyError("Network error")).toBe("retryable");
        expect(classifyError("Connection error")).toBe("retryable");
      });

      it("알 수 없는 에러는 기본값으로 retryable", () => {
        expect(classifyError("Unknown error occurred")).toBe("retryable");
        expect(classifyError("Something went wrong")).toBe("retryable");
        expect(classifyError(new Error("Generic error"))).toBe("retryable");
      });
    });

    describe("repair errors (구조 수정 필요)", () => {
      it("JSON 파싱 에러는 repair", () => {
        expect(classifyError("JSON parse error")).toBe("repair");
        expect(classifyError("Invalid JSON")).toBe("repair");
        expect(classifyError("Unexpected token in JSON")).toBe("repair");
      });

      it("스키마 검증 에러는 repair", () => {
        expect(classifyError("Schema validation failed")).toBe("repair");
        expect(classifyError("Validation failed")).toBe("repair");
      });

      it("문법 에러는 repair", () => {
        expect(classifyError("Syntax error")).toBe("repair");
        expect(classifyError("Malformed request")).toBe("repair");
      });
    });

    describe("non-retryable errors (복구 불가)", () => {
      it("not found 에러는 non-retryable", () => {
        expect(classifyError("Resource not found")).toBe("non-retryable");
        expect(classifyError("Sprint does not exist")).toBe("non-retryable");
        expect(classifyError("404 Not Found")).toBe("non-retryable");
      });

      it("인증/인가 에러는 non-retryable", () => {
        expect(classifyError("401 Unauthorized")).toBe("non-retryable");
        expect(classifyError("403 Forbidden")).toBe("non-retryable");
        expect(classifyError("Permission denied")).toBe("non-retryable");
        expect(classifyError("Access denied")).toBe("non-retryable");
      });

      it("상태 전환 에러는 non-retryable", () => {
        expect(classifyError("Invalid state transition")).toBe("non-retryable");
        expect(classifyError("State transition not allowed")).toBe("non-retryable");
      });
    });

    describe("Error object 처리", () => {
      it("Error 객체도 처리 가능", () => {
        expect(classifyError(new Error("Connection timeout"))).toBe("retryable");
        expect(classifyError(new Error("JSON parse error"))).toBe("repair");
        expect(classifyError(new Error("Not found"))).toBe("non-retryable");
      });
    });
  });

  describe("getEffectiveMaxRetries", () => {
    it("non-retryable은 0을 반환", () => {
      expect(getEffectiveMaxRetries(6, "non-retryable")).toBe(0);
      expect(getEffectiveMaxRetries(3, "non-retryable")).toBe(0);
    });

    it("repair는 최대 3까지만", () => {
      expect(getEffectiveMaxRetries(6, "repair")).toBe(3);
      expect(getEffectiveMaxRetries(2, "repair")).toBe(2); // 기존값이 더 작으면 그대로
    });

    it("retryable은 기본값 그대로", () => {
      expect(getEffectiveMaxRetries(6, "retryable")).toBe(6);
      expect(getEffectiveMaxRetries(10, "retryable")).toBe(10);
    });
  });
});
