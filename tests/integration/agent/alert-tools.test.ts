import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import {
  makeUser,
  makeDiscovery,
  makeAlert,
  makeWebhookConfig,
  makeDiscoveryKpi,
  resetFixtureCounter,
} from "../../helpers/fixtures";
import { users, discoveries, alerts, webhookConfigs, discoveryKpis } from "~/db/schema";
import {
  getAlerts,
  acknowledgeAlert,
  manageWebhook,
} from "~/features/chat/agent/tools/alert-tools";

function asDB(db: TestDB) {
  return db as unknown as Parameters<typeof getAlerts>[0];
}

describe("Agent alert-tools", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
  });

  // ─── getAlerts ────────────────────────────────────────────────────────

  describe("getAlerts", () => {
    it("returns empty list when no alerts", async () => {
      const result = JSON.parse(await getAlerts(asDB(db), {}));

      expect(result.alerts).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it("returns all alerts by default", async () => {
      const alert1 = makeAlert({ severity: "warning", message: "Alert 1" });
      const alert2 = makeAlert({ severity: "critical", message: "Alert 2" });
      db.insert(alerts).values([alert1, alert2]).run();

      const result = JSON.parse(await getAlerts(asDB(db), {}));

      expect(result.alerts).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it("filters by severity", async () => {
      const alert1 = makeAlert({ severity: "warning", message: "Warning alert" });
      const alert2 = makeAlert({ severity: "critical", message: "Critical alert" });
      db.insert(alerts).values([alert1, alert2]).run();

      const result = JSON.parse(
        await getAlerts(asDB(db), { severity: "critical" })
      );

      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].severity).toBe("critical");
    });

    it("filters by acknowledged status", async () => {
      const alert1 = makeAlert({ acknowledged: 0 });
      const alert2 = makeAlert({ acknowledged: 1 });
      db.insert(alerts).values([alert1, alert2]).run();

      const unacknowledged = JSON.parse(
        await getAlerts(asDB(db), { acknowledged: false })
      );
      expect(unacknowledged.alerts).toHaveLength(1);
      expect(unacknowledged.alerts[0].acknowledged).toBe(false);

      const acknowledged = JSON.parse(
        await getAlerts(asDB(db), { acknowledged: true })
      );
      expect(acknowledged.alerts).toHaveLength(1);
      expect(acknowledged.alerts[0].acknowledged).toBe(true);
    });

    it("combines severity and acknowledged filters", async () => {
      const alert1 = makeAlert({ severity: "warning", acknowledged: 0 });
      const alert2 = makeAlert({ severity: "warning", acknowledged: 1 });
      const alert3 = makeAlert({ severity: "critical", acknowledged: 0 });
      db.insert(alerts).values([alert1, alert2, alert3]).run();

      const result = JSON.parse(
        await getAlerts(asDB(db), { severity: "warning", acknowledged: false })
      );

      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].severity).toBe("warning");
      expect(result.alerts[0].acknowledged).toBe(false);
    });

    it("respects limit parameter", async () => {
      for (let i = 0; i < 10; i++) {
        const alert = makeAlert({ message: `Alert ${i}` });
        db.insert(alerts).values(alert).run();
      }

      const result = JSON.parse(await getAlerts(asDB(db), { limit: 5 }));

      expect(result.alerts).toHaveLength(5);
    });

    it("orders by firedAt descending", async () => {
      const alert1 = makeAlert({ firedAt: new Date("2026-01-01") });
      const alert2 = makeAlert({ firedAt: new Date("2026-01-03") });
      const alert3 = makeAlert({ firedAt: new Date("2026-01-02") });
      db.insert(alerts).values([alert1, alert2, alert3]).run();

      const result = JSON.parse(await getAlerts(asDB(db), {}));

      // Most recent first
      expect(new Date(result.alerts[0].firedAt).getTime()).toBeGreaterThan(
        new Date(result.alerts[1].firedAt).getTime()
      );
    });

    it("includes discovery and KPI references", async () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const disc = makeDiscovery({ id: "disc-1", ownerId: user.id });
      db.insert(discoveries).values(disc).run();

      // Create KPI for foreign key constraint
      const kpi = makeDiscoveryKpi({ id: "kpi-1", discoveryId: "disc-1" });
      db.insert(discoveryKpis).values(kpi).run();

      const alert = makeAlert({
        discoveryId: "disc-1",
        kpiId: "kpi-1",
      });
      db.insert(alerts).values(alert).run();

      const result = JSON.parse(await getAlerts(asDB(db), {}));

      expect(result.alerts[0].discoveryId).toBe("disc-1");
      expect(result.alerts[0].kpiId).toBe("kpi-1");
    });
  });

  // ─── acknowledgeAlert ─────────────────────────────────────────────────

  describe("acknowledgeAlert", () => {
    it("returns error for non-existent alert", async () => {
      const result = JSON.parse(
        await acknowledgeAlert(asDB(db), { alertId: "non-existent" })
      );

      expect(result.error).toContain("알림을 찾을 수 없습니다");
    });

    it("acknowledges alert successfully", async () => {
      const alert = makeAlert({ id: "alert-1", acknowledged: 0 });
      db.insert(alerts).values(alert).run();

      const result = JSON.parse(
        await acknowledgeAlert(asDB(db), { alertId: "alert-1" })
      );

      expect(result.message).toContain("확인 처리");
      expect(result.alertId).toBe("alert-1");

      // Verify DB update
      const updated = db.select().from(alerts).all()[0];
      expect(updated.acknowledged).toBe(1);
      expect(updated.acknowledgedAt).toBeDefined();
    });

    it("sets acknowledgedBy when userId provided", async () => {
      const user = makeUser({ id: "user-1" });
      db.insert(users).values(user).run();

      const alert = makeAlert({ id: "alert-1", acknowledged: 0 });
      db.insert(alerts).values(alert).run();

      await acknowledgeAlert(asDB(db), {
        alertId: "alert-1",
        userId: "user-1",
      });

      const updated = db.select().from(alerts).all()[0];
      expect(updated.acknowledgedBy).toBe("user-1");
    });

    it("returns message for already acknowledged alert", async () => {
      const alert = makeAlert({ id: "alert-1", acknowledged: 1 });
      db.insert(alerts).values(alert).run();

      const result = JSON.parse(
        await acknowledgeAlert(asDB(db), { alertId: "alert-1" })
      );

      expect(result.message).toContain("이미 확인된");
    });
  });

  // ─── manageWebhook ────────────────────────────────────────────────────

  describe("manageWebhook", () => {
    describe("list action", () => {
      it("returns empty list when no webhooks", async () => {
        const result = JSON.parse(
          await manageWebhook(asDB(db), { action: "list" })
        );

        expect(result.webhooks).toHaveLength(0);
        expect(result.total).toBe(0);
      });

      it("lists all webhooks", async () => {
        const webhook1 = makeWebhookConfig({ name: "Slack", platform: "slack" });
        const webhook2 = makeWebhookConfig({ name: "Teams", platform: "teams" });
        db.insert(webhookConfigs).values([webhook1, webhook2]).run();

        const result = JSON.parse(
          await manageWebhook(asDB(db), { action: "list" })
        );

        expect(result.webhooks).toHaveLength(2);
        expect(result.total).toBe(2);
      });

      it("returns webhook details", async () => {
        const webhook = makeWebhookConfig({
          name: "Test Webhook",
          url: "https://hooks.test.com/abc",
          platform: "slack",
          events: ["alert_fired"],
          enabled: 1,
        });
        db.insert(webhookConfigs).values(webhook).run();

        const result = JSON.parse(
          await manageWebhook(asDB(db), { action: "list" })
        );

        expect(result.webhooks[0].name).toBe("Test Webhook");
        expect(result.webhooks[0].url).toBe("https://hooks.test.com/abc");
        expect(result.webhooks[0].platform).toBe("slack");
        expect(result.webhooks[0].enabled).toBe(true);
      });
    });

    describe("create action", () => {
      it("returns error when name missing", async () => {
        const result = JSON.parse(
          await manageWebhook(asDB(db), {
            action: "create",
            url: "https://hooks.test.com",
          })
        );

        expect(result.error).toContain("name과 url은 필수");
      });

      it("returns error when url missing", async () => {
        const result = JSON.parse(
          await manageWebhook(asDB(db), {
            action: "create",
            name: "Test Webhook",
          })
        );

        expect(result.error).toContain("name과 url은 필수");
      });

      it("creates webhook successfully", async () => {
        const result = JSON.parse(
          await manageWebhook(asDB(db), {
            action: "create",
            name: "New Webhook",
            url: "https://hooks.test.com/new",
            platform: "slack",
            events: ["alert_fired", "discovery_created"],
          })
        );

        expect(result.message).toContain("생성");
        expect(result.webhookId).toBeDefined();

        // Verify DB insert
        const webhooks = db.select().from(webhookConfigs).all();
        expect(webhooks).toHaveLength(1);
        expect(webhooks[0].name).toBe("New Webhook");
      });

      it("sets default platform to custom", async () => {
        await manageWebhook(asDB(db), {
          action: "create",
          name: "Generic Webhook",
          url: "https://hooks.test.com",
        });

        const webhook = db.select().from(webhookConfigs).all()[0];
        expect(webhook.platform).toBe("custom");
      });

      it("sets default events to wildcard", async () => {
        await manageWebhook(asDB(db), {
          action: "create",
          name: "All Events Webhook",
          url: "https://hooks.test.com",
        });

        const webhook = db.select().from(webhookConfigs).all()[0];
        expect(webhook.events).toEqual(["*"]);
      });

      it("creates enabled webhook by default", async () => {
        await manageWebhook(asDB(db), {
          action: "create",
          name: "Enabled Webhook",
          url: "https://hooks.test.com",
        });

        const webhook = db.select().from(webhookConfigs).all()[0];
        expect(webhook.enabled).toBe(1);
      });

      it("creates disabled webhook when specified", async () => {
        await manageWebhook(asDB(db), {
          action: "create",
          name: "Disabled Webhook",
          url: "https://hooks.test.com",
          enabled: false,
        });

        const webhook = db.select().from(webhookConfigs).all()[0];
        expect(webhook.enabled).toBe(0);
      });
    });

    describe("update action", () => {
      it("returns error when webhookId missing", async () => {
        const result = JSON.parse(
          await manageWebhook(asDB(db), {
            action: "update",
            name: "Updated Name",
          })
        );

        expect(result.error).toContain("webhookId는 필수");
      });

      it("returns error for non-existent webhook", async () => {
        const result = JSON.parse(
          await manageWebhook(asDB(db), {
            action: "update",
            webhookId: "non-existent",
            name: "Updated",
          })
        );

        expect(result.error).toContain("웹훅을 찾을 수 없습니다");
      });

      it("updates webhook name", async () => {
        const webhook = makeWebhookConfig({ id: "webhook-1", name: "Original" });
        db.insert(webhookConfigs).values(webhook).run();

        const result = JSON.parse(
          await manageWebhook(asDB(db), {
            action: "update",
            webhookId: "webhook-1",
            name: "Updated Name",
          })
        );

        expect(result.message).toContain("업데이트");

        const updated = db.select().from(webhookConfigs).all()[0];
        expect(updated.name).toBe("Updated Name");
      });

      it("updates webhook url", async () => {
        const webhook = makeWebhookConfig({
          id: "webhook-1",
          url: "https://old.url",
        });
        db.insert(webhookConfigs).values(webhook).run();

        await manageWebhook(asDB(db), {
          action: "update",
          webhookId: "webhook-1",
          url: "https://new.url",
        });

        const updated = db.select().from(webhookConfigs).all()[0];
        expect(updated.url).toBe("https://new.url");
      });

      it("updates webhook enabled status", async () => {
        const webhook = makeWebhookConfig({ id: "webhook-1", enabled: 1 });
        db.insert(webhookConfigs).values(webhook).run();

        await manageWebhook(asDB(db), {
          action: "update",
          webhookId: "webhook-1",
          enabled: false,
        });

        const updated = db.select().from(webhookConfigs).all()[0];
        expect(updated.enabled).toBe(0);
      });

      it("updates multiple fields at once", async () => {
        const webhook = makeWebhookConfig({
          id: "webhook-1",
          name: "Old",
          platform: "custom",
        });
        db.insert(webhookConfigs).values(webhook).run();

        await manageWebhook(asDB(db), {
          action: "update",
          webhookId: "webhook-1",
          name: "New",
          platform: "slack",
          events: ["alert_fired"],
        });

        const updated = db.select().from(webhookConfigs).all()[0];
        expect(updated.name).toBe("New");
        expect(updated.platform).toBe("slack");
        expect(updated.events).toEqual(["alert_fired"]);
      });
    });

    describe("delete action", () => {
      it("returns error when webhookId missing", async () => {
        const result = JSON.parse(
          await manageWebhook(asDB(db), { action: "delete" })
        );

        expect(result.error).toContain("webhookId는 필수");
      });

      it("deletes webhook successfully", async () => {
        const webhook = makeWebhookConfig({ id: "webhook-1" });
        db.insert(webhookConfigs).values(webhook).run();

        const result = JSON.parse(
          await manageWebhook(asDB(db), {
            action: "delete",
            webhookId: "webhook-1",
          })
        );

        expect(result.message).toContain("삭제");

        const remaining = db.select().from(webhookConfigs).all();
        expect(remaining).toHaveLength(0);
      });

      it("returns success even for non-existent webhook", async () => {
        const result = JSON.parse(
          await manageWebhook(asDB(db), {
            action: "delete",
            webhookId: "non-existent",
          })
        );

        // SQLite DELETE doesn't error on non-existent rows
        expect(result.message).toContain("삭제");
      });
    });

    describe("unknown action", () => {
      it("returns error for unknown action", async () => {
        const result = JSON.parse(
          await manageWebhook(asDB(db), { action: "unknown" as "list" })
        );

        expect(result.error).toContain("알 수 없는 action");
      });
    });
  });
});
