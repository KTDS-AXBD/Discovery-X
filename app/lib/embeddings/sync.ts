/**
 * Embedding sync: batch process stale records, generate embeddings,
 * upsert to Vectorize, and detect evidence duplicates.
 */

import { eq, sql, and, or, isNull, lt } from "drizzle-orm";
import type { DB } from "~/db";
import { discoveries, evidence, evidenceDuplicateCandidates } from "~/db/schema";
import {
  upsertDiscoveryEmbedding,
  upsertEvidenceEmbedding,
  findDuplicateEvidence,
  type EmbeddingEnv,
} from "./embedding-service";

interface SyncResult {
  discoveriesSynced: number;
  evidenceSynced: number;
  duplicatesFound: number;
  errors: string[];
}

/**
 * Sync embeddings for stale records (embedding_updated_at IS NULL or < updated_at).
 * Processes in batches to avoid timeout.
 */
export async function syncEmbeddings(
  db: DB,
  env: EmbeddingEnv,
  batchSize: number = 10,
  tenantId?: string
): Promise<SyncResult> {
  const result: SyncResult = {
    discoveriesSynced: 0,
    evidenceSynced: 0,
    duplicatesFound: 0,
    errors: [],
  };

  // 1. Sync discovery embeddings
  const staleCondition = or(
    isNull(discoveries.embeddingUpdatedAt),
    lt(discoveries.embeddingUpdatedAt, discoveries.updatedAt)
  );
  const discoveriesWhere = tenantId
    ? and(staleCondition, eq(discoveries.tenantId, tenantId))
    : staleCondition;
  const staleDiscoveries = await db
    .select({
      id: discoveries.id,
      title: discoveries.title,
      seedSummary: discoveries.seedSummary,
      updatedAt: discoveries.updatedAt,
      embeddingUpdatedAt: discoveries.embeddingUpdatedAt,
    })
    .from(discoveries)
    .where(discoveriesWhere)
    .limit(batchSize);

  for (const disc of staleDiscoveries) {
    try {
      await upsertDiscoveryEmbedding(env, disc.id, disc.title, disc.seedSummary);
      await db
        .update(discoveries)
        .set({ embeddingUpdatedAt: new Date() })
        .where(eq(discoveries.id, disc.id));
      result.discoveriesSynced++;
    } catch (e) {
      result.errors.push(`discovery ${disc.id}: ${e instanceof Error ? e.message : "Unknown"}`);
    }
  }

  // 2. Sync evidence embeddings + duplicate detection
  const staleEvidence = await db
    .select({
      id: evidence.id,
      content: evidence.content,
      discoveryId: evidence.discoveryId,
      createdAt: evidence.createdAt,
      embeddingUpdatedAt: evidence.embeddingUpdatedAt,
    })
    .from(evidence)
    .where(
      or(
        isNull(evidence.embeddingUpdatedAt),
        sql`${evidence.embeddingUpdatedAt} < ${evidence.createdAt}`
      )
    )
    .limit(batchSize);

  for (const ev of staleEvidence) {
    try {
      await upsertEvidenceEmbedding(env, ev.id, ev.content, ev.discoveryId);
      await db
        .update(evidence)
        .set({ embeddingUpdatedAt: new Date() })
        .where(eq(evidence.id, ev.id));
      result.evidenceSynced++;

      // Detect duplicates
      const duplicates = await findDuplicateEvidence(env, ev.id, ev.content);
      for (const dup of duplicates) {
        // Check if candidate pair already exists (in either direction)
        const existing = await db
          .select({ id: evidenceDuplicateCandidates.id })
          .from(evidenceDuplicateCandidates)
          .where(
            or(
              and(
                eq(evidenceDuplicateCandidates.evidenceId1, ev.id),
                eq(evidenceDuplicateCandidates.evidenceId2, dup.id)
              ),
              and(
                eq(evidenceDuplicateCandidates.evidenceId1, dup.id),
                eq(evidenceDuplicateCandidates.evidenceId2, ev.id)
              )
            )
          )
          .limit(1);

        if (existing.length === 0) {
          await db.insert(evidenceDuplicateCandidates).values({
            id: crypto.randomUUID(),
            evidenceId1: ev.id,
            evidenceId2: dup.id,
            similarityScore: Math.round(dup.score * 100),
            reason: "Vectorize 시맨틱 유사도 감지",
          });
          result.duplicatesFound++;
        }
      }
    } catch (e) {
      result.errors.push(`evidence ${ev.id}: ${e instanceof Error ? e.message : "Unknown"}`);
    }
  }

  return result;
}
