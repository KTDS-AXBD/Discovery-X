import { eq, and } from "drizzle-orm";
import type { DB } from "~/db";
import {
  skillCatalog,
  type NewSkillCatalogEntry,
} from "~/features/ideas/db/schema";

// ============================================================================
// Service
// ============================================================================

export class SkillCatalogService {
  constructor(private db: DB) {}

  /** 카테고리별 활성 스킬 목록 조회 */
  async listByCategory(category?: string) {
    if (category) {
      return this.db
        .select()
        .from(skillCatalog)
        .where(
          and(eq(skillCatalog.enabled, 1), eq(skillCatalog.category, category)),
        )
        .orderBy(skillCatalog.sortOrder);
    }
    return this.db
      .select()
      .from(skillCatalog)
      .where(eq(skillCatalog.enabled, 1))
      .orderBy(skillCatalog.sortOrder);
  }

  /** slug로 스킬 단건 조회 */
  async getBySlug(slug: string) {
    return (
      (await this.db
        .select()
        .from(skillCatalog)
        .where(eq(skillCatalog.slug, slug))
        .get()) ?? null
    );
  }

  /** 시드 데이터 upsert (slug 기준) */
  async seedCatalog(seeds: NewSkillCatalogEntry[]) {
    let upserted = 0;
    for (const seed of seeds) {
      const existing = await this.db
        .select({ id: skillCatalog.id })
        .from(skillCatalog)
        .where(eq(skillCatalog.slug, seed.slug))
        .get();

      if (existing) {
        await this.db
          .update(skillCatalog)
          .set({
            name: seed.name,
            description: seed.description,
            category: seed.category,
            inputType: seed.inputType,
            promptTemplate: seed.promptTemplate,
            outputSchema: seed.outputSchema,
            chainNext: seed.chainNext,
            sortOrder: seed.sortOrder,
            enabled: seed.enabled,
          })
          .where(eq(skillCatalog.id, existing.id));
      } else {
        await this.db.insert(skillCatalog).values(seed);
      }
      upserted++;
    }
    return { upserted };
  }
}
