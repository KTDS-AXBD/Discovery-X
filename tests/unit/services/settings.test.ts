import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb } from "tests/helpers/db";
import type { DB } from "~/db";
import { users, tenants, tenantMembers } from "~/db";
import { SettingsService } from "~/features/settings/service/settings.service";

let db: ReturnType<typeof createTestDb>;
let service: SettingsService;

const TENANT_ID = "t-settings-test";
const OWNER_ID = "user-settings-owner";
const MEMBER_ID = "user-settings-member";
const OUTSIDER_ID = "user-settings-outsider";

beforeAll(() => {
  db = createTestDb();
  service = new SettingsService(db as unknown as DB);

  db.insert(users)
    .values([
      { id: OWNER_ID, email: "owner@test.com", name: "Owner User", role: "admin" },
      { id: MEMBER_ID, email: "member@test.com", name: "Member User", role: "user" },
      { id: OUTSIDER_ID, email: "outsider@test.com", name: "Outsider User", role: "user" },
    ])
    .run();

  db.insert(tenants)
    .values([
      { id: TENANT_ID, name: "Settings Tenant", slug: "settings-test", ownerUserId: OWNER_ID },
    ])
    .run();

  db.insert(tenantMembers)
    .values([
      { id: "tm-settings-owner", tenantId: TENANT_ID, userId: OWNER_ID, role: "owner" },
      { id: "tm-settings-member", tenantId: TENANT_ID, userId: MEMBER_ID, role: "member" },
    ])
    .run();
});

describe("SettingsService.getTenant", () => {
  it("존재하는 테넌트 — TenantInfo 반환", async () => {
    const result = await service.getTenant(TENANT_ID);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(TENANT_ID);
    expect(result!.name).toBe("Settings Tenant");
    expect(result!.slug).toBe("settings-test");
    expect(result!.plan).toBe("free");
    expect(result!.status).toBe("active");
    expect(result!.ownerUserId).toBe(OWNER_ID);
  });

  it("미존재 테넌트 — null 반환", async () => {
    const result = await service.getTenant("nonexistent-tenant");
    expect(result).toBeNull();
  });
});

describe("SettingsService.getMembers", () => {
  it("멤버 목록 (users join) 반환", async () => {
    const members = await service.getMembers(TENANT_ID);
    expect(members.length).toBe(2);

    const owner = members.find((m) => m.userId === OWNER_ID);
    expect(owner).toBeDefined();
    expect(owner!.name).toBe("Owner User");
    expect(owner!.email).toBe("owner@test.com");
    expect(owner!.role).toBe("owner");

    const member = members.find((m) => m.userId === MEMBER_ID);
    expect(member).toBeDefined();
    expect(member!.name).toBe("Member User");
    expect(member!.role).toBe("member");
  });

  it("멤버 없는 테넌트 — 빈 배열", async () => {
    // 존재하지 않는 테넌트의 멤버 조회
    const members = await service.getMembers("nonexistent-tenant");
    expect(members).toEqual([]);
  });
});

describe("SettingsService.updateTenantName", () => {
  it("owner가 이름 변경 — 성공", async () => {
    const result = await service.updateTenantName(TENANT_ID, OWNER_ID, "New Name");
    expect(result.success).toBe(true);

    const tenant = await service.getTenant(TENANT_ID);
    expect(tenant!.name).toBe("New Name");
  });

  it("비owner가 이름 변경 — 에러", async () => {
    const result = await service.updateTenantName(TENANT_ID, MEMBER_ID, "Hacked Name");
    expect(result.success).toBe(false);
    expect(result.error).toContain("owner");
  });

  it("빈 이름으로 변경 — 에러", async () => {
    const result = await service.updateTenantName(TENANT_ID, OWNER_ID, "   ");
    expect(result.success).toBe(false);
    expect(result.error).toContain("required");
  });
});

describe("SettingsService.inviteMember", () => {
  it("미가입 유저 초대 — 에러", async () => {
    const result = await service.inviteMember(TENANT_ID, "unknown@test.com", "member", OWNER_ID);
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("이미 멤버인 유저 초대 — 에러", async () => {
    const result = await service.inviteMember(TENANT_ID, "member@test.com", "member", OWNER_ID);
    expect(result.success).toBe(false);
    expect(result.error).toContain("already a member");
  });

  it("정상 초대 — 성공", async () => {
    const result = await service.inviteMember(TENANT_ID, "outsider@test.com", "member", OWNER_ID);
    expect(result.success).toBe(true);
    expect(result.message).toContain("Outsider User");

    // 초대 후 멤버 목록에 포함 확인
    const members = await service.getMembers(TENANT_ID);
    const outsider = members.find((m) => m.userId === OUTSIDER_ID);
    expect(outsider).toBeDefined();
  });
});

describe("SettingsService.removeMember", () => {
  it("owner 제거 불가", async () => {
    const result = await service.removeMember(TENANT_ID, OWNER_ID);
    expect(result.success).toBe(false);
    expect(result.error).toContain("owner");
  });

  it("일반 멤버 제거 — 성공", async () => {
    // OUTSIDER_ID는 위 inviteMember 테스트에서 추가됨
    const result = await service.removeMember(TENANT_ID, OUTSIDER_ID);
    expect(result.success).toBe(true);
    expect(result.message).toContain("removed");

    // 제거 후 멤버 목록에서 제외 확인
    const members = await service.getMembers(TENANT_ID);
    const outsider = members.find((m) => m.userId === OUTSIDER_ID);
    expect(outsider).toBeUndefined();
  });
});
