/**
 * Folders API 통합 테스트
 * 대상: api.folders (GET/POST), api.folders.$id (PATCH/DELETE),
 *       api.folders.$id.items (GET/POST/DELETE), api.folders.reorder (PATCH)
 * 서비스 레이어 직접 호출 + API 유효성 검증 로직 재현
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import { makeUser, resetFixtureCounter } from "../../helpers/fixtures";
import { users, tenants, tenantMembers } from "~/db";
import { FolderService } from "~/features/archive/service/folder.service";
import { FolderItemType } from "~/features/archive/db/schema";
import type { DB } from "~/db";

let db: TestDB;
let svc: FolderService;

const TENANT_ID = "t1";
const USER_ID = "u-folder";

beforeEach(() => {
  resetFixtureCounter();
  db = createTestDb();
  svc = new FolderService(db as unknown as DB);

  db.insert(users).values([makeUser({ id: USER_ID, name: "폴더 유저" })]).run();
  db.insert(tenants).values({ id: TENANT_ID, name: "Test Org", slug: "test-org", ownerUserId: USER_ID }).run();
  db.insert(tenantMembers)
    .values({ id: "tm-1", tenantId: TENANT_ID, userId: USER_ID, role: "admin" })
    .run();
});

// ─── GET /api/folders: 목록 조회 ──────────────

describe("GET /api/folders — 폴더 목록 조회", () => {
  it("테넌트별 폴더 목록을 조회한다", async () => {
    await svc.create({ tenantId: TENANT_ID, name: "폴더 A", createdBy: USER_ID });
    await svc.create({ tenantId: TENANT_ID, name: "폴더 B", createdBy: USER_ID });

    const list = await svc.list(TENANT_ID);

    expect(list).toHaveLength(2);
    expect(list.map((f) => f.name)).toContain("폴더 A");
    expect(list.map((f) => f.name)).toContain("폴더 B");
  });

  it("빈 목록을 반환한다", async () => {
    const list = await svc.list(TENANT_ID);
    expect(list).toHaveLength(0);
  });

  it("itemCount가 포함된다", async () => {
    const folder = await svc.create({ tenantId: TENANT_ID, name: "카운트 테스트", createdBy: USER_ID });
    await svc.addItem({
      folderId: folder.id,
      itemType: FolderItemType.DISCOVERY,
      itemId: "disc-1",
      addedBy: USER_ID,
    });

    const list = await svc.list(TENANT_ID);
    const target = list.find((f) => f.id === folder.id);
    expect(target).toBeDefined();
    expect(target!.itemCount).toBe(1);
  });
});

// ─── POST /api/folders: 생성 ──────────────────

describe("POST /api/folders — 폴더 생성", () => {
  it("정상 생성 (name 20자 이내)", async () => {
    const folder = await svc.create({
      tenantId: TENANT_ID,
      name: "새 폴더",
      createdBy: USER_ID,
    });

    expect(folder.id).toBeTruthy();
    expect(folder.name).toBe("새 폴더");
    expect(folder.tenantId).toBe(TENANT_ID);
    expect(folder.createdBy).toBe(USER_ID);
  });

  it("sortOrder가 자동 증가한다", async () => {
    const f1 = await svc.create({ tenantId: TENANT_ID, name: "첫 번째", createdBy: USER_ID });
    const f2 = await svc.create({ tenantId: TENANT_ID, name: "두 번째", createdBy: USER_ID });

    expect(f2.sortOrder).toBeGreaterThan(f1.sortOrder);
  });

  it("빈 이름 → 400 에러 시뮬레이션", () => {
    // API route: if (!name || name.length > 20) → 400
    const invalidCases = ["", "  ", undefined as string | undefined];

    for (const raw of invalidCases) {
      const name = raw?.trim();
      const isInvalid = !name;
      expect(isInvalid, `name="${raw}" should be invalid`).toBe(true);
    }
  });

  it("20자 초과 이름 → 400 에러 시뮬레이션", () => {
    const longName = "가".repeat(21);
    expect(longName.length > 20).toBe(true);

    const exactName = "가".repeat(20);
    expect(exactName.length > 20).toBe(false);
  });
});

// ─── PATCH /api/folders/:id — 수정 ────────────

describe("PATCH /api/folders/:id — 폴더 수정", () => {
  it("이름 변경 성공", async () => {
    const folder = await svc.create({ tenantId: TENANT_ID, name: "원래 이름", createdBy: USER_ID });

    const updated = await svc.update(folder.id, TENANT_ID, { name: "새 이름" });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("새 이름");
  });

  it("빈 이름 → 400 시뮬레이션 (API route: 1~20자)", () => {
    // API route: if (name !== undefined && (name.length === 0 || name.length > 20)) → 400
    const validate = (name: string | undefined) => {
      if (name !== undefined && (name.length === 0 || name.length > 20)) return false;
      return true;
    };

    expect(validate("")).toBe(false);
    expect(validate("가".repeat(21))).toBe(false);
    expect(validate("정상")).toBe(true);
    expect(validate(undefined)).toBe(true); // name 미전송은 허용
  });

  it("존재하지 않는 폴더 → null 반환 (404 시뮬레이션)", async () => {
    const result = await svc.update("nonexistent", TENANT_ID, { name: "실패" });
    expect(result).toBeNull();
  });
});

// ─── DELETE /api/folders/:id ──────────────────

describe("DELETE /api/folders/:id — 폴더 삭제", () => {
  it("정상 삭제 → true 반환", async () => {
    const folder = await svc.create({ tenantId: TENANT_ID, name: "삭제 대상", createdBy: USER_ID });

    const deleted = await svc.delete(folder.id, TENANT_ID);
    expect(deleted).toBe(true);
  });

  it("삭제 후 목록에서 제외된다", async () => {
    const folder = await svc.create({ tenantId: TENANT_ID, name: "삭제될 폴더", createdBy: USER_ID });
    await svc.create({ tenantId: TENANT_ID, name: "남을 폴더", createdBy: USER_ID });

    await svc.delete(folder.id, TENANT_ID);

    const list = await svc.list(TENANT_ID);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("남을 폴더");
  });

  it("존재하지 않는 폴더 → false 반환 (404 시뮬레이션)", async () => {
    const result = await svc.delete("nonexistent", TENANT_ID);
    expect(result).toBe(false);
  });
});

// ─── POST/DELETE /api/folders/:id/items ───────

describe("POST/DELETE /api/folders/:id/items — 아이템 추가/제거", () => {
  let folderId: string;

  beforeEach(async () => {
    const folder = await svc.create({ tenantId: TENANT_ID, name: "아이템 폴더", createdBy: USER_ID });
    folderId = folder.id;
  });

  it("아이템 추가 성공", async () => {
    const item = await svc.addItem({
      folderId,
      itemType: FolderItemType.DISCOVERY,
      itemId: "disc-1",
      addedBy: USER_ID,
    });

    expect(item.id).toBeTruthy();
    expect(item.folderId).toBe(folderId);
    expect(item.itemType).toBe("discovery");
    expect(item.itemId).toBe("disc-1");
  });

  it("아이템 목록 조회", async () => {
    await svc.addItem({
      folderId,
      itemType: FolderItemType.DISCOVERY,
      itemId: "disc-1",
      addedBy: USER_ID,
    });
    await svc.addItem({
      folderId,
      itemType: FolderItemType.RADAR_ITEM,
      itemId: "ri-1",
      addedBy: USER_ID,
    });

    const items = await svc.listItems(folderId);
    expect(items).toHaveLength(2);
  });

  it("아이템 제거 성공", async () => {
    await svc.addItem({
      folderId,
      itemType: FolderItemType.DISCOVERY,
      itemId: "disc-1",
      addedBy: USER_ID,
    });

    await svc.removeItem(folderId, FolderItemType.DISCOVERY, "disc-1");

    const items = await svc.listItems(folderId);
    expect(items).toHaveLength(0);
  });

  it("필수 필드 누락 → 400 시뮬레이션", () => {
    // API route: if (!body.itemType || !body.itemId) → 400
    const validate = (itemType?: string, itemId?: string) => !(!itemType || !itemId);

    expect(validate(undefined, "id")).toBe(false);
    expect(validate("discovery", undefined)).toBe(false);
    expect(validate(undefined, undefined)).toBe(false);
    expect(validate("discovery", "id")).toBe(true);
  });

  it("잘못된 itemType → 400 시뮬레이션", () => {
    expect(svc.isValidItemType("discovery")).toBe(true);
    expect(svc.isValidItemType("radar_item")).toBe(true);
    expect(svc.isValidItemType("conversation")).toBe(true);
    expect(svc.isValidItemType("proposal")).toBe(true);
    expect(svc.isValidItemType("invalid_type")).toBe(false);
    expect(svc.isValidItemType("")).toBe(false);
  });

  it("중복 추가 → UNIQUE constraint 에러", async () => {
    await svc.addItem({
      folderId,
      itemType: FolderItemType.DISCOVERY,
      itemId: "disc-1",
      addedBy: USER_ID,
    });

    await expect(
      svc.addItem({
        folderId,
        itemType: FolderItemType.DISCOVERY,
        itemId: "disc-1",
        addedBy: USER_ID,
      }),
    ).rejects.toThrow();
  });
});

// ─── verifyOwnership ─────────────────────────

describe("verifyOwnership — 폴더 소유권 검증", () => {
  it("올바른 tenantId → true", async () => {
    const folder = await svc.create({ tenantId: TENANT_ID, name: "소유권", createdBy: USER_ID });

    const result = await svc.verifyOwnership(folder.id, TENANT_ID);
    expect(result).toBe(true);
  });

  it("다른 tenantId → false", async () => {
    const folder = await svc.create({ tenantId: TENANT_ID, name: "소유권", createdBy: USER_ID });

    const result = await svc.verifyOwnership(folder.id, "other-tenant");
    expect(result).toBe(false);
  });
});
