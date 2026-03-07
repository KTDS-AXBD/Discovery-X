import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireWebhooks } from "~/lib/notifications/webhook";
import type { DB } from "~/db";
import { webhookConfigs } from "~/db";
import { createTestDb } from "tests/helpers/db";

function createDb() {
  return createTestDb();
}

const baseAlert = {
  id: "alert-001",
  alertType: "overdue",
  severity: "warning",
  message: "기한 초과 알림",
  discoveryId: "disc-001",
  kpiId: null,
};

describe("fireWebhooks", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function insertConfig(
    db: ReturnType<typeof createDb>,
    overrides: Partial<{
      id: string;
      name: string;
      url: string;
      events: string[];
      platform: string;
      enabled: number;
      headers: Record<string, string>;
    }> = {}
  ) {
    await db.insert(webhookConfigs).values({
      id: overrides.id ?? "wh-1",
      name: overrides.name ?? "Test Hook",
      url: overrides.url ?? "https://hooks.example.com/test",
      events: overrides.events ?? ["*"],
      platform: overrides.platform ?? "custom",
      enabled: overrides.enabled ?? 1,
      headers: overrides.headers ?? {},
    });
  }

  it("Slack payload — blocks + attachments 구조 확인", async () => {
    const db = createDb();
    await insertConfig(db, { platform: "slack" });
    fetchMock.mockResolvedValue({ ok: true });

    await fireWebhooks(db as unknown as DB, baseAlert);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.blocks).toBeDefined();
    expect(body.blocks[0].type).toBe("section");
    expect(body.attachments).toBeDefined();
    expect(body.attachments[0].color).toBeDefined();
  });

  it("Teams payload — @type MessageCard + sections", async () => {
    const db = createDb();
    await insertConfig(db, { platform: "teams" });
    fetchMock.mockResolvedValue({ ok: true });

    await fireWebhooks(db as unknown as DB, baseAlert);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body["@type"]).toBe("MessageCard");
    expect(body.sections).toBeDefined();
    expect(body.sections.length).toBeGreaterThan(0);
  });

  it("Custom payload — alertId/type/severity 필드", async () => {
    const db = createDb();
    await insertConfig(db, { platform: "custom" });
    fetchMock.mockResolvedValue({ ok: true });

    await fireWebhooks(db as unknown as DB, baseAlert);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.alertId).toBe("alert-001");
    expect(body.type).toBe("overdue");
    expect(body.severity).toBe("warning");
  });

  it("성공 시 sent 카운트 반환", async () => {
    const db = createDb();
    await insertConfig(db, { id: "wh-a" });
    await insertConfig(db, { id: "wh-b", name: "Hook B", url: "https://hooks.example.com/b" });
    fetchMock.mockResolvedValue({ ok: true });

    const sent = await fireWebhooks(db as unknown as DB, baseAlert);
    expect(sent).toBe(2);
  });

  it("events 필터링: 매칭되지 않는 이벤트는 스킵", async () => {
    const db = createDb();
    await insertConfig(db, { events: ["gate_expired", "stalled"] });
    fetchMock.mockResolvedValue({ ok: true });

    const sent = await fireWebhooks(db as unknown as DB, { ...baseAlert, alertType: "overdue" });
    expect(sent).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetch 실패 시 에러 로깅 + sent 0", async () => {
    const db = createDb();
    await insertConfig(db);
    fetchMock.mockRejectedValue(new Error("Network error"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const sent = await fireWebhooks(db as unknown as DB, baseAlert);
    expect(sent).toBe(0);
    expect(consoleSpy).toHaveBeenCalled();
  });
});
