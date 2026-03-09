import { eq, and, asc, desc, count, max, sql } from "drizzle-orm";
import type { DB } from "~/db";
import {
  archiveFolders,
  archiveFolderItems,
  FolderItemType,
} from "~/features/archive/db/schema";
import type { FolderItemTypeValue } from "~/features/archive/db/schema";
import { NotFoundError, ValidationError } from "~/lib/errors";

// ============================================================================
// Types
// ============================================================================

type Folder = typeof archiveFolders.$inferSelect;
type FolderItem = typeof archiveFolderItems.$inferSelect;

interface FolderWithItemCount extends Folder {
  itemCount: number;
}

interface CreateFolderInput {
  tenantId: string;
  name: string;
  createdBy: string;
}

interface UpdateFolderInput {
  name?: string;
  icon?: string;
}

interface AddItemInput {
  folderId: string;
  itemType: FolderItemTypeValue;
  itemId: string;
  addedBy: string;
}

// ============================================================================
// Validation
// ============================================================================

const VALID_ITEM_TYPES = new Set<string>(Object.values(FolderItemType));

// ============================================================================
// Service
// ============================================================================

export class FolderService {
  constructor(private db: DB) {}

  // --------------------------------------------------------------------------
  // 폴더 조회
  // --------------------------------------------------------------------------

  /** 테넌트의 전체 폴더 목록 (아이템 수 포함) */
  async list(tenantId: string): Promise<FolderWithItemCount[]> {
    const itemCountSq = this.db
      .select({
        folderId: archiveFolderItems.folderId,
        itemCount: count(archiveFolderItems.id).as("item_count"),
      })
      .from(archiveFolderItems)
      .groupBy(archiveFolderItems.folderId)
      .as("item_counts");

    const folders = await this.db
      .select({
        id: archiveFolders.id,
        tenantId: archiveFolders.tenantId,
        name: archiveFolders.name,
        icon: archiveFolders.icon,
        sortOrder: archiveFolders.sortOrder,
        createdBy: archiveFolders.createdBy,
        createdAt: archiveFolders.createdAt,
        updatedAt: archiveFolders.updatedAt,
        itemCount: sql<number>`coalesce(${itemCountSq.itemCount}, 0)`.as("item_count"),
      })
      .from(archiveFolders)
      .leftJoin(itemCountSq, eq(archiveFolders.id, itemCountSq.folderId))
      .where(eq(archiveFolders.tenantId, tenantId))
      .orderBy(asc(archiveFolders.sortOrder), asc(archiveFolders.createdAt));

    return folders as FolderWithItemCount[];
  }

  /** 폴더 소유권 검증 */
  async verifyOwnership(folderId: string, tenantId: string): Promise<boolean> {
    const folder = await this.db
      .select({ id: archiveFolders.id })
      .from(archiveFolders)
      .where(and(eq(archiveFolders.id, folderId), eq(archiveFolders.tenantId, tenantId)))
      .get();
    return !!folder;
  }

  // --------------------------------------------------------------------------
  // 폴더 생성
  // --------------------------------------------------------------------------

  /** 새 폴더 생성 (sortOrder 자동 할당) */
  async create(input: CreateFolderInput): Promise<Folder> {
    const maxOrder = await this.db
      .select({ val: max(archiveFolders.sortOrder) })
      .from(archiveFolders)
      .where(eq(archiveFolders.tenantId, input.tenantId))
      .get();

    const nextOrder = (maxOrder?.val ?? -1) + 1;

    const [folder] = await this.db
      .insert(archiveFolders)
      .values({
        tenantId: input.tenantId,
        name: input.name,
        sortOrder: nextOrder,
        createdBy: input.createdBy,
      })
      .returning();

    return folder;
  }

  // --------------------------------------------------------------------------
  // 폴더 수정
  // --------------------------------------------------------------------------

  /** 폴더 이름/아이콘 변경 */
  async update(
    folderId: string,
    tenantId: string,
    input: UpdateFolderInput,
  ): Promise<Folder | null> {
    const updates: Record<string, unknown> = { updatedAt: sql`(unixepoch())` };
    if (input.name !== undefined) updates.name = input.name;
    if (input.icon !== undefined) updates.icon = input.icon;

    const result = await this.db
      .update(archiveFolders)
      .set(updates)
      .where(and(eq(archiveFolders.id, folderId), eq(archiveFolders.tenantId, tenantId)))
      .returning();

    return result[0] ?? null;
  }

  /** 폴더 삭제 */
  async delete(folderId: string, tenantId: string): Promise<boolean> {
    const result = await this.db
      .delete(archiveFolders)
      .where(and(eq(archiveFolders.id, folderId), eq(archiveFolders.tenantId, tenantId)))
      .returning({ id: archiveFolders.id });

    return result.length > 0;
  }

  /** 폴더 순서 변경 (배치) */
  async reorder(tenantId: string, orderedIds: string[]): Promise<void> {
    const statements = orderedIds.map((id, index) =>
      this.db
        .update(archiveFolders)
        .set({ sortOrder: index })
        .where(and(eq(archiveFolders.id, id), eq(archiveFolders.tenantId, tenantId))),
    );
    await this.db.batch(statements as [typeof statements[0], ...typeof statements[0][]]);
  }

  // --------------------------------------------------------------------------
  // 폴더 아이템
  // --------------------------------------------------------------------------

  /** 폴더의 아이템 목록 */
  async listItems(folderId: string): Promise<FolderItem[]> {
    return this.db
      .select()
      .from(archiveFolderItems)
      .where(eq(archiveFolderItems.folderId, folderId))
      .orderBy(desc(archiveFolderItems.addedAt));
  }

  /** 아이템 추가 */
  async addItem(input: AddItemInput): Promise<FolderItem> {
    if (!this.isValidItemType(input.itemType)) {
      throw new ValidationError("itemType", `invalid item type: ${input.itemType}`);
    }

    const folder = await this.db
      .select({ id: archiveFolders.id })
      .from(archiveFolders)
      .where(eq(archiveFolders.id, input.folderId))
      .get();

    if (!folder) {
      throw new NotFoundError("Folder", input.folderId);
    }

    const [item] = await this.db
      .insert(archiveFolderItems)
      .values({
        folderId: input.folderId,
        itemType: input.itemType,
        itemId: input.itemId,
        addedBy: input.addedBy,
      })
      .returning();

    return item;
  }

  /** 아이템 제거 */
  async removeItem(folderId: string, itemType: string, itemId: string): Promise<void> {
    await this.db
      .delete(archiveFolderItems)
      .where(
        and(
          eq(archiveFolderItems.folderId, folderId),
          eq(archiveFolderItems.itemType, itemType),
          eq(archiveFolderItems.itemId, itemId),
        ),
      );
  }

  /** 유효한 아이템 타입인지 검증 */
  isValidItemType(type: string): type is FolderItemTypeValue {
    return VALID_ITEM_TYPES.has(type);
  }
}
