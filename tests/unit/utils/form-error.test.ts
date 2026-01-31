import { describe, it, expect } from "vitest";
import { getFormErrorMessage } from "~/lib/utils/form-error";

describe("getFormErrorMessage", () => {
  it("returns message from Error instance", () => {
    expect(getFormErrorMessage(new Error("Something failed"))).toBe("Something failed");
  });

  it("returns message from TypeError", () => {
    expect(getFormErrorMessage(new TypeError("Type error"))).toBe("Type error");
  });

  it("returns fallback for null", () => {
    expect(getFormErrorMessage(null)).toBe("입력값이 유효하지 않습니다");
  });

  it("returns fallback for string", () => {
    expect(getFormErrorMessage("some string")).toBe("입력값이 유효하지 않습니다");
  });

  it("returns custom fallback", () => {
    expect(getFormErrorMessage(null, "Custom fallback")).toBe("Custom fallback");
  });
});
