/**
 * ACL 모듈 단위 테스트
 * 대상: app/lib/acl/resolver.ts, app/lib/acl/policies.ts, app/lib/acl/types.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb } from "tests/helpers/db";
import type { DB } from "~/db";
import { users, tenants, tenantMembers, topics, topicMembers } from "~/db";
import { ScopeResolver } from "~/lib/acl/resolver";
import {
  PERMISSION_MATRIX,
  AGENT_ALLOWED_ACTIONS,
  MATRIX_POLICIES,
} from "~/lib/acl/policies";

let db: ReturnType<typeof createTestDb>;
let resolver: ScopeResolver;

const USER_1 = "user-acl-1"; // admin
const USER_2 = "user-acl-2"; // viewer
const USER_3 = "user-acl-3"; // no membership
const TENANT_ID = "tenant-acl-1";
const TOPIC_ID = "topic-acl-1";

beforeAll(() => {
  db = createTestDb();
  resolver = new ScopeResolver(db as unknown as DB);

  // users
  db.insert(users)
    .values([
      { id: USER_1, email: "acl-1@test.com", name: "ACL Admin", role: "admin" },
      { id: USER_2, email: "acl-2@test.com", name: "ACL Viewer", role: "user" },
      { id: USER_3, email: "acl-3@test.com", name: "ACL None", role: "user" },
    ])
    .run();

  // tenant
  db.insert(tenants)
    .values({ id: TENANT_ID, name: "ACL Tenant", slug: "acl-tenant", ownerUserId: USER_1 })
    .run();

  // tenant members
  db.insert(tenantMembers)
    .values([
      { id: "tm-1", tenantId: TENANT_ID, userId: USER_1, role: "owner" },
      { id: "tm-2", tenantId: TENANT_ID, userId: USER_2, role: "viewer" },
    ])
    .run();

  // topic
  db.insert(topics)
    .values({ id: TOPIC_ID, teamId: TENANT_ID, name: "ACL Topic", createdBy: USER_1 })
    .run();

  // topic members
  db.insert(topicMembers)
    .values([
      { topicId: TOPIC_ID, userId: USER_1, role: "owner" },
      { topicId: TOPIC_ID, userId: USER_2, role: "viewer" },
    ])
    .run();
});

// ── extractScope ────────────────────────────────────────────────────

describe("ScopeResolver.extractScope", () => {
  it("1. /topics/abc-123 → topic scope", () => {
    const scope = resolver.extractScope("/topics/abc-123");
    expect(scope).toEqual({ scopeType: "topic", scopeId: "abc-123" });
  });

  it("2. /topics/abc-123/decisions → topic scope (하위 경로)", () => {
    const scope = resolver.extractScope("/topics/abc-123/decisions");
    expect(scope).toEqual({ scopeType: "topic", scopeId: "abc-123" });
  });

  it("3. /profile → user scope", () => {
    const scope = resolver.extractScope("/profile");
    expect(scope).toEqual({ scopeType: "user", scopeId: "" });
  });

  it("4. /profile/history → user scope (하위 경로)", () => {
    const scope = resolver.extractScope("/profile/history");
    expect(scope).toEqual({ scopeType: "user", scopeId: "" });
  });

  it("5. /admin → org scope", () => {
    const scope = resolver.extractScope("/admin");
    expect(scope).toEqual({ scopeType: "org", scopeId: "default" });
  });

  it("6. /admin/users → org scope (하위 경로)", () => {
    const scope = resolver.extractScope("/admin/users");
    expect(scope).toEqual({ scopeType: "org", scopeId: "default" });
  });

  it("7. /dashboard → null (ACL 대상 아님)", () => {
    expect(resolver.extractScope("/dashboard")).toBeNull();
  });

  it("8. /discoveries/abc → null", () => {
    expect(resolver.extractScope("/discoveries/abc")).toBeNull();
  });
});

// ── getRole ─────────────────────────────────────────────────────────

describe("ScopeResolver.getRole", () => {
  it("9. user scope — 자기 자신이면 owner", async () => {
    expect(await resolver.getRole(USER_1, "user", USER_1)).toBe("owner");
    expect(await resolver.getRole(USER_1, "user", "")).toBe("owner");
  });

  it("9b. user scope — 타인이면 none", async () => {
    expect(await resolver.getRole(USER_1, "user", USER_2)).toBe("none");
  });

  it("10. topic scope — 멤버면 해당 role", async () => {
    expect(await resolver.getRole(USER_1, "topic", TOPIC_ID)).toBe("owner");
    expect(await resolver.getRole(USER_2, "topic", TOPIC_ID)).toBe("viewer");
  });

  it("10b. topic scope — 멤버 아니면 none", async () => {
    expect(await resolver.getRole(USER_3, "topic", TOPIC_ID)).toBe("none");
  });

  it("11. org scope — tenant_members role 매핑", async () => {
    // owner → owner
    expect(await resolver.getRole(USER_1, "org", TENANT_ID)).toBe("owner");
    // viewer → viewer
    expect(await resolver.getRole(USER_2, "org", TENANT_ID)).toBe("viewer");
  });

  it("11b. org scope — 멤버 아니면 none", async () => {
    expect(await resolver.getRole(USER_3, "org", TENANT_ID)).toBe("none");
  });
});

// ── resolve ─────────────────────────────────────────────────────────

describe("ScopeResolver.resolve", () => {
  it("12. topic owner + read → allowed", async () => {
    const result = await resolver.resolve({
      userId: USER_1,
      scopeType: "topic",
      scopeId: TOPIC_ID,
      action: "read",
    });
    expect(result.allowed).toBe(true);
    expect(result.role).toBe("owner");
  });

  it("13. topic viewer + write → denied", async () => {
    const result = await resolver.resolve({
      userId: USER_2,
      scopeType: "topic",
      scopeId: TOPIC_ID,
      action: "write",
    });
    expect(result.allowed).toBe(false);
    expect(result.role).toBe("viewer");
  });

  it("14. topic none + read → denied", async () => {
    const result = await resolver.resolve({
      userId: USER_3,
      scopeType: "topic",
      scopeId: TOPIC_ID,
      action: "read",
    });
    expect(result.allowed).toBe(false);
    expect(result.role).toBe("none");
  });
});

// ── PERMISSION_MATRIX ───────────────────────────────────────────────

describe("PERMISSION_MATRIX", () => {
  it("15. owner: 4개 모두 true", () => {
    expect(PERMISSION_MATRIX.owner).toEqual({
      read: true, write: true, delete: true, admin: true,
    });
  });

  it("16. editor: read/write true, delete/admin false", () => {
    expect(PERMISSION_MATRIX.editor).toEqual({
      read: true, write: true, delete: false, admin: false,
    });
  });

  it("17. viewer: read만 true", () => {
    expect(PERMISSION_MATRIX.viewer).toEqual({
      read: true, write: false, delete: false, admin: false,
    });
  });

  it("18. none: 4개 모두 false", () => {
    expect(PERMISSION_MATRIX.none).toEqual({
      read: false, write: false, delete: false, admin: false,
    });
  });
});

// ── AGENT_ALLOWED_ACTIONS ───────────────────────────────────────────

describe("AGENT_ALLOWED_ACTIONS", () => {
  it("19. read/write만 포함", () => {
    expect(AGENT_ALLOWED_ACTIONS.has("read")).toBe(true);
    expect(AGENT_ALLOWED_ACTIONS.has("write")).toBe(true);
    expect(AGENT_ALLOWED_ACTIONS.has("delete")).toBe(false);
    expect(AGENT_ALLOWED_ACTIONS.has("admin")).toBe(false);
    expect(AGENT_ALLOWED_ACTIONS.size).toBe(2);
  });
});

// ── MATRIX_POLICIES ─────────────────────────────────────────────────

describe("MATRIX_POLICIES", () => {
  it("20. 정의된 키 수 및 minRole 검증", () => {
    const keys = Object.keys(MATRIX_POLICIES);
    expect(keys.length).toBe(6);

    expect(MATRIX_POLICIES["matrix.view"].minRole).toBe("viewer");
    expect(MATRIX_POLICIES["matrix.cell.edit"].minRole).toBe("editor");
    expect(MATRIX_POLICIES["matrix.score.edit"].minRole).toBe("editor");
    expect(MATRIX_POLICIES["matrix.score.edit"].selfOnly).toBe(true);
    expect(MATRIX_POLICIES["matrix.master.edit"].minRole).toBe("owner");
    expect(MATRIX_POLICIES["matrix.config.edit"].minRole).toBe("owner");
    expect(MATRIX_POLICIES["matrix.cell.delete"].minRole).toBe("owner");
  });
});
