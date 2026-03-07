import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mockSend };
  },
}));

import { createEmailClient } from "~/lib/notifications/email";

describe("createEmailClient", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it("성공 시 { success: true }", async () => {
    mockSend.mockResolvedValue({ data: { id: "msg-1" }, error: null });

    const client = createEmailClient("re_test_key");
    const result = await client.send({
      to: "user@example.com",
      subject: "테스트 이메일",
      html: "<p>안녕하세요</p>",
    });

    expect(result).toEqual({ success: true });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@example.com",
        subject: "테스트 이메일",
        html: "<p>안녕하세요</p>",
        from: expect.stringContaining("Discovery-X"),
      })
    );
  });

  it("Resend 에러 시 { success: false, error: message }", async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { message: "Invalid API key", name: "validation_error" },
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const client = createEmailClient("re_bad_key");
    const result = await client.send({
      to: "user@example.com",
      subject: "실패 테스트",
      html: "<p>실패</p>",
    });

    expect(result).toEqual({ success: false, error: "Invalid API key" });
    consoleSpy.mockRestore();
  });

  it("예외 throw 시 { success: false, error: message }", async () => {
    mockSend.mockRejectedValue(new Error("Connection refused"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const client = createEmailClient("re_test_key");
    const result = await client.send({
      to: "user@example.com",
      subject: "예외 테스트",
      html: "<p>예외</p>",
    });

    expect(result).toEqual({ success: false, error: "Connection refused" });
    consoleSpy.mockRestore();
  });
});
