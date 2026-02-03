import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDB } from "../../helpers/db";
import { users } from "~/db/schema";
import { vdSprints, vdTaskQueue } from "~/features/venture/db/schema";
import {
  enqueueTask,
  failTask,
} from "~/features/venture/repositories/task-queue.repository";
import type { DB } from "~/db";

// 테스트 DB를 실제 DB 타입으로 캐스팅
const asDB = (testDb: TestDB): DB => testDb as unknown as DB;

describe("task-queue.repository", () => {
  let testDb: TestDB;
  let testUserId: string;
  let testSprintId: string;
  let db: DB;

  beforeEach(async () => {
    testDb = createTestDb();
    db = asDB(testDb);

    // 테스트 사용자 생성
    testUserId = crypto.randomUUID();
    await testDb.insert(users).values({
      id: testUserId,
      email: "test@example.com",
      name: "Test User",
    });

    // 테스트 스프린트 생성
    testSprintId = crypto.randomUUID();
    await testDb.insert(vdSprints).values({
      id: testSprintId,
      name: "Test Sprint",
      ownerId: testUserId,
      status: "RUNNING",
    });
  });

  describe("enqueueTask idempotency", () => {
    it("dedupeKey 없이 동일 task 여러 번 enqueue하면 모두 생성됨", async () => {
      const task1 = await enqueueTask(db, testSprintId, {
        taskType: "COLLECT_SIGNALS",
        input: { test: 1 },
      });

      const task2 = await enqueueTask(db, testSprintId, {
        taskType: "COLLECT_SIGNALS",
        input: { test: 1 },
      });

      expect(task1.id).not.toBe(task2.id);
    });

    it("dedupeKey가 같으면 기존 task 반환 (중복 방지)", async () => {
      const dedupeKey = `sprint:${testSprintId}:COLLECT_SIGNALS`;

      const task1 = await enqueueTask(db, testSprintId, {
        taskType: "COLLECT_SIGNALS",
        input: { test: 1 },
        dedupeKey,
      });

      const task2 = await enqueueTask(db, testSprintId, {
        taskType: "COLLECT_SIGNALS",
        input: { test: 2 }, // 다른 input
        dedupeKey,
      });

      expect(task2.id).toBe(task1.id);
      expect(task2.input).toEqual({ test: 1 }); // 원래 값 유지
    });

    it("다른 dedupeKey면 새 task 생성", async () => {
      const task1 = await enqueueTask(db, testSprintId, {
        taskType: "COLLECT_SIGNALS",
        dedupeKey: "key-1",
      });

      const task2 = await enqueueTask(db, testSprintId, {
        taskType: "COLLECT_SIGNALS",
        dedupeKey: "key-2",
      });

      expect(task1.id).not.toBe(task2.id);
    });
  });

  describe("failTask backoff policy", () => {
    it("기본 백오프는 30초 * 2^retryCount (±20% jitter)", async () => {
      const task = await enqueueTask(db, testSprintId, {
        taskType: "COLLECT_SIGNALS",
      });

      // RUNNING 상태로 변경
      await testDb
        .update(vdTaskQueue)
        .set({ status: "RUNNING", startedAt: new Date() })
        .where(eq(vdTaskQueue.id, task.id));

      const beforeFail = Date.now();
      const failedTask = await failTask(db, task.id, "Test error", "retryable");

      expect(failedTask).not.toBeNull();
      expect(failedTask!.status).toBe("PENDING");
      expect(failedTask!.retryCount).toBe(1);

      // 백오프 검증: 30초 * 2^1 = 60초 (±20%)
      // 실제 범위: 48초 ~ 72초
      const scheduledAt = failedTask!.scheduledAt!.getTime();
      const expectedBaseMs = 30 * 2 * 1000; // 60초
      const minMs = beforeFail + expectedBaseMs * 0.8;
      const maxMs = beforeFail + expectedBaseMs * 1.2 + 1000; // 약간의 여유

      expect(scheduledAt).toBeGreaterThanOrEqual(minMs);
      expect(scheduledAt).toBeLessThanOrEqual(maxMs);
    });

    it("백오프는 30분으로 캡됨", async () => {
      const task = await enqueueTask(db, testSprintId, {
        taskType: "COLLECT_SIGNALS",
      });

      // retryCount를 높게 설정 (30초 * 2^10 = 30720초 > 1800초)
      await testDb
        .update(vdTaskQueue)
        .set({
          status: "RUNNING",
          startedAt: new Date(),
          retryCount: 9, // 다음이 10번째
        })
        .where(eq(vdTaskQueue.id, task.id));

      const beforeFail = Date.now();
      const failedTask = await failTask(db, task.id, "Test error", "retryable");

      expect(failedTask).not.toBeNull();

      // 30분 캡 적용됨: 1800초 * (0.8~1.2)
      const scheduledAt = failedTask!.scheduledAt!.getTime();
      const maxBackoffMs = 30 * 60 * 1000; // 30분

      // 캡 적용 후 jitter: 1440초 ~ 2160초
      expect(scheduledAt).toBeLessThanOrEqual(beforeFail + maxBackoffMs * 1.2 + 1000);
    });

    it("non-retryable 에러는 즉시 FAILED", async () => {
      const task = await enqueueTask(db, testSprintId, {
        taskType: "COLLECT_SIGNALS",
      });

      await testDb
        .update(vdTaskQueue)
        .set({ status: "RUNNING", startedAt: new Date() })
        .where(eq(vdTaskQueue.id, task.id));

      const failedTask = await failTask(db, task.id, "Resource not found", "non-retryable");

      expect(failedTask).not.toBeNull();
      expect(failedTask!.status).toBe("FAILED");
      expect(failedTask!.completedAt).not.toBeNull();
    });

    it("repair 에러는 최대 3회까지만 재시도", async () => {
      const task = await enqueueTask(db, testSprintId, {
        taskType: "COLLECT_SIGNALS",
      });

      // retryCount=2로 설정 (다음이 3번째, repair는 최대 3이므로 FAILED)
      await testDb
        .update(vdTaskQueue)
        .set({
          status: "RUNNING",
          startedAt: new Date(),
          retryCount: 2,
        })
        .where(eq(vdTaskQueue.id, task.id));

      const failedTask = await failTask(db, task.id, "JSON parse error", "repair");

      expect(failedTask).not.toBeNull();
      expect(failedTask!.status).toBe("FAILED"); // 3회 초과
      expect(failedTask!.retryCount).toBe(3);
    });

    it("repair 에러지만 아직 재시도 가능하면 PENDING", async () => {
      const task = await enqueueTask(db, testSprintId, {
        taskType: "COLLECT_SIGNALS",
      });

      await testDb
        .update(vdTaskQueue)
        .set({
          status: "RUNNING",
          startedAt: new Date(),
          retryCount: 1, // 다음이 2번째, repair 최대 3 내
        })
        .where(eq(vdTaskQueue.id, task.id));

      const failedTask = await failTask(db, task.id, "JSON parse error", "repair");

      expect(failedTask).not.toBeNull();
      expect(failedTask!.status).toBe("PENDING");
      expect(failedTask!.retryCount).toBe(2);
    });

    it("errorType 없으면 기본 maxRetries 사용", async () => {
      const task = await enqueueTask(db, testSprintId, {
        taskType: "COLLECT_SIGNALS",
      });

      await testDb
        .update(vdTaskQueue)
        .set({ status: "RUNNING", startedAt: new Date() })
        .where(eq(vdTaskQueue.id, task.id));

      // errorType 없이 호출
      const failedTask = await failTask(db, task.id, "Unknown error");

      expect(failedTask).not.toBeNull();
      expect(failedTask!.status).toBe("PENDING"); // maxRetries=6이므로 재시도
    });
  });

  describe("maxRetries 설정", () => {
    it("모든 task type의 maxRetries가 6으로 설정됨", async () => {
      const taskTypes = [
        "COLLECT_SIGNALS",
        "ANALYZE_PROBLEMS",
        "GENERATE_OPPORTUNITIES",
        "CLUSTER_THEMES",
        "SCORE_OPPORTUNITIES",
        "GENERATE_DEEPDIVE",
        "GENERATE_ARTIFACTS",
        "PREPARE_GATE",
      ] as const;

      for (const taskType of taskTypes) {
        const task = await enqueueTask(db, testSprintId, { taskType });
        expect(task.maxRetries).toBe(6);
      }
    });
  });
});
