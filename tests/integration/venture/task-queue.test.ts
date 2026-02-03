import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDB } from "../../helpers/db";
import { users } from "~/db/schema";
import { vdSprints, vdTaskQueue } from "~/features/venture/db/schema";
import {
  enqueueTask,
  failTask,
  claimTasks,
  completeTask,
  listTasksBySprint,
  getPendingTaskCount,
  getRunningTaskCount,
  listFailedTasks,
  listStuckTasks,
  deleteTask,
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

  describe("claimTasks", () => {
    it("PENDING 상태이고 scheduledAt <= now인 작업만 반환한다", async () => {
      // 과거 예약 (가져와야 함)
      await enqueueTask(db, testSprintId, {
        taskType: "COLLECT_SIGNALS",
        scheduledAt: new Date(Date.now() - 1000),
      });
      // 미래 예약 (가져오면 안됨)
      await enqueueTask(db, testSprintId, {
        taskType: "ANALYZE_PROBLEMS",
        scheduledAt: new Date(Date.now() + 60000),
      });

      const claimed = await claimTasks(db, 10);

      expect(claimed.length).toBe(1);
      expect(claimed[0].taskType).toBe("COLLECT_SIGNALS");
    });

    it("priority 높은 순, createdAt 빠른 순 정렬한다", async () => {
      const task1 = await enqueueTask(db, testSprintId, {
        taskType: "COLLECT_SIGNALS",
        priority: 1,
      });
      const task2 = await enqueueTask(db, testSprintId, {
        taskType: "ANALYZE_PROBLEMS",
        priority: 10, // 높은 priority
      });
      const task3 = await enqueueTask(db, testSprintId, {
        taskType: "CLUSTER_THEMES",
        priority: 10, // 같은 priority, 나중에 생성
      });

      const claimed = await claimTasks(db, 10);

      // task2가 먼저 (높은 priority)
      // task3이 다음 (같은 priority, task2 이후 생성되었으나 같은 priority면 createdAt으로)
      // task1이 마지막 (낮은 priority)
      expect(claimed[0].id).toBe(task2.id);
      expect(claimed[2].id).toBe(task1.id);
    });

    it("limit 개수만큼만 반환한다", async () => {
      await enqueueTask(db, testSprintId, { taskType: "COLLECT_SIGNALS" });
      await enqueueTask(db, testSprintId, { taskType: "ANALYZE_PROBLEMS" });
      await enqueueTask(db, testSprintId, { taskType: "CLUSTER_THEMES" });

      const claimed = await claimTasks(db, 2);

      expect(claimed.length).toBe(2);
    });

    it("claim된 작업은 RUNNING 상태로 변경된다", async () => {
      const task = await enqueueTask(db, testSprintId, {
        taskType: "COLLECT_SIGNALS",
      });

      const claimed = await claimTasks(db, 10);

      expect(claimed[0].id).toBe(task.id);
      expect(claimed[0].status).toBe("RUNNING");
      expect(claimed[0].startedAt).not.toBeNull();
    });

    it("PENDING 작업이 없으면 빈 배열 반환한다", async () => {
      // 모든 작업을 RUNNING으로 변경
      const task = await enqueueTask(db, testSprintId, {
        taskType: "COLLECT_SIGNALS",
      });
      await testDb
        .update(vdTaskQueue)
        .set({ status: "RUNNING", startedAt: new Date() })
        .where(eq(vdTaskQueue.id, task.id));

      const claimed = await claimTasks(db, 10);

      expect(claimed.length).toBe(0);
    });
  });

  describe("completeTask", () => {
    it("status를 COMPLETED로 변경한다", async () => {
      const task = await enqueueTask(db, testSprintId, {
        taskType: "COLLECT_SIGNALS",
      });
      await testDb
        .update(vdTaskQueue)
        .set({ status: "RUNNING", startedAt: new Date() })
        .where(eq(vdTaskQueue.id, task.id));

      const completed = await completeTask(db, task.id);

      expect(completed).not.toBeNull();
      expect(completed!.status).toBe("COMPLETED");
    });

    it("output을 저장한다", async () => {
      const task = await enqueueTask(db, testSprintId, {
        taskType: "COLLECT_SIGNALS",
      });

      const output = { signalsCollected: 10, sources: ["news", "research"] };
      const completed = await completeTask(db, task.id, output);

      expect(completed).not.toBeNull();
      expect(completed!.output).toEqual(output);
    });

    it("completedAt을 설정한다", async () => {
      const task = await enqueueTask(db, testSprintId, {
        taskType: "COLLECT_SIGNALS",
      });

      const beforeComplete = Date.now();
      const completed = await completeTask(db, task.id);

      expect(completed).not.toBeNull();
      expect(completed!.completedAt).not.toBeNull();
      expect(completed!.completedAt!.getTime()).toBeGreaterThanOrEqual(beforeComplete);
    });

    it("존재하지 않는 taskId는 null 반환한다", async () => {
      const result = await completeTask(db, "non-existent-id");

      expect(result).toBeNull();
    });
  });

  describe("listTasksBySprint", () => {
    it("sprintId로 필터링한다", async () => {
      await enqueueTask(db, testSprintId, { taskType: "COLLECT_SIGNALS" });

      // 다른 스프린트 생성
      const otherSprintId = crypto.randomUUID();
      await testDb.insert(vdSprints).values({
        id: otherSprintId,
        name: "Other Sprint",
        ownerId: testUserId,
        status: "RUNNING",
      });
      await enqueueTask(db, otherSprintId, { taskType: "ANALYZE_PROBLEMS" });

      const tasks = await listTasksBySprint(db, testSprintId);

      expect(tasks.length).toBe(1);
      expect(tasks[0].taskType).toBe("COLLECT_SIGNALS");
    });

    it("status 필터를 적용한다", async () => {
      const task1 = await enqueueTask(db, testSprintId, { taskType: "COLLECT_SIGNALS" });
      await enqueueTask(db, testSprintId, { taskType: "ANALYZE_PROBLEMS" });

      // task1을 RUNNING으로 변경
      await testDb
        .update(vdTaskQueue)
        .set({ status: "RUNNING", startedAt: new Date() })
        .where(eq(vdTaskQueue.id, task1.id));

      const tasks = await listTasksBySprint(db, testSprintId, { status: "PENDING" });

      expect(tasks.length).toBe(1);
      expect(tasks[0].taskType).toBe("ANALYZE_PROBLEMS");
    });

    it("taskType 필터를 적용한다", async () => {
      await enqueueTask(db, testSprintId, { taskType: "COLLECT_SIGNALS" });
      await enqueueTask(db, testSprintId, { taskType: "ANALYZE_PROBLEMS" });
      await enqueueTask(db, testSprintId, { taskType: "COLLECT_SIGNALS" });

      const tasks = await listTasksBySprint(db, testSprintId, { taskType: "COLLECT_SIGNALS" });

      expect(tasks.length).toBe(2);
      expect(tasks.every(t => t.taskType === "COLLECT_SIGNALS")).toBe(true);
    });

    it("limit을 적용한다", async () => {
      await enqueueTask(db, testSprintId, { taskType: "COLLECT_SIGNALS" });
      await enqueueTask(db, testSprintId, { taskType: "ANALYZE_PROBLEMS" });
      await enqueueTask(db, testSprintId, { taskType: "CLUSTER_THEMES" });

      const tasks = await listTasksBySprint(db, testSprintId, { limit: 2 });

      expect(tasks.length).toBe(2);
    });

    it("createdAt 내림차순 정렬한다", async () => {
      // 과거 시간으로 명시적으로 설정하여 순서 보장
      const task1 = await enqueueTask(db, testSprintId, { taskType: "COLLECT_SIGNALS" });
      // task1의 createdAt을 1초 전으로 수정
      await testDb
        .update(vdTaskQueue)
        .set({ createdAt: new Date(Date.now() - 1000) })
        .where(eq(vdTaskQueue.id, task1.id));

      const task2 = await enqueueTask(db, testSprintId, { taskType: "ANALYZE_PROBLEMS" });

      const tasks = await listTasksBySprint(db, testSprintId);

      // 최신 것이 먼저 (task2)
      expect(tasks[0].id).toBe(task2.id);
      expect(tasks[1].id).toBe(task1.id);
    });
  });

  describe("getPendingTaskCount / getRunningTaskCount", () => {
    it("전체 PENDING 작업 수를 반환한다", async () => {
      await enqueueTask(db, testSprintId, { taskType: "COLLECT_SIGNALS" });
      await enqueueTask(db, testSprintId, { taskType: "ANALYZE_PROBLEMS" });

      const count = await getPendingTaskCount(db);

      expect(count).toBe(2);
    });

    it("sprintId로 필터링된 PENDING 작업 수를 반환한다", async () => {
      await enqueueTask(db, testSprintId, { taskType: "COLLECT_SIGNALS" });

      // 다른 스프린트
      const otherSprintId = crypto.randomUUID();
      await testDb.insert(vdSprints).values({
        id: otherSprintId,
        name: "Other Sprint",
        ownerId: testUserId,
        status: "RUNNING",
      });
      await enqueueTask(db, otherSprintId, { taskType: "ANALYZE_PROBLEMS" });

      const count = await getPendingTaskCount(db, testSprintId);

      expect(count).toBe(1);
    });

    it("전체 RUNNING 작업 수를 반환한다", async () => {
      const task1 = await enqueueTask(db, testSprintId, { taskType: "COLLECT_SIGNALS" });
      const task2 = await enqueueTask(db, testSprintId, { taskType: "ANALYZE_PROBLEMS" });

      // 둘 다 RUNNING으로 변경
      await testDb
        .update(vdTaskQueue)
        .set({ status: "RUNNING", startedAt: new Date() })
        .where(eq(vdTaskQueue.id, task1.id));
      await testDb
        .update(vdTaskQueue)
        .set({ status: "RUNNING", startedAt: new Date() })
        .where(eq(vdTaskQueue.id, task2.id));

      const count = await getRunningTaskCount(db);

      expect(count).toBe(2);
    });

    it("sprintId로 필터링된 RUNNING 작업 수를 반환한다", async () => {
      const task = await enqueueTask(db, testSprintId, { taskType: "COLLECT_SIGNALS" });
      await testDb
        .update(vdTaskQueue)
        .set({ status: "RUNNING", startedAt: new Date() })
        .where(eq(vdTaskQueue.id, task.id));

      // 다른 스프린트의 RUNNING 작업
      const otherSprintId = crypto.randomUUID();
      await testDb.insert(vdSprints).values({
        id: otherSprintId,
        name: "Other Sprint",
        ownerId: testUserId,
        status: "RUNNING",
      });
      const otherTask = await enqueueTask(db, otherSprintId, { taskType: "ANALYZE_PROBLEMS" });
      await testDb
        .update(vdTaskQueue)
        .set({ status: "RUNNING", startedAt: new Date() })
        .where(eq(vdTaskQueue.id, otherTask.id));

      const count = await getRunningTaskCount(db, testSprintId);

      expect(count).toBe(1);
    });
  });

  describe("listFailedTasks", () => {
    it("FAILED 상태 작업만 반환한다", async () => {
      const task1 = await enqueueTask(db, testSprintId, { taskType: "COLLECT_SIGNALS" });
      await enqueueTask(db, testSprintId, { taskType: "ANALYZE_PROBLEMS" }); // PENDING

      // task1을 FAILED로 변경
      await testDb
        .update(vdTaskQueue)
        .set({ status: "FAILED", error: "Test error", completedAt: new Date() })
        .where(eq(vdTaskQueue.id, task1.id));

      const tasks = await listFailedTasks(db);

      expect(tasks.length).toBe(1);
      expect(tasks[0].id).toBe(task1.id);
    });

    it("sprintId로 필터링한다", async () => {
      const task = await enqueueTask(db, testSprintId, { taskType: "COLLECT_SIGNALS" });
      await testDb
        .update(vdTaskQueue)
        .set({ status: "FAILED", error: "Error", completedAt: new Date() })
        .where(eq(vdTaskQueue.id, task.id));

      // 다른 스프린트의 FAILED 작업
      const otherSprintId = crypto.randomUUID();
      await testDb.insert(vdSprints).values({
        id: otherSprintId,
        name: "Other Sprint",
        ownerId: testUserId,
        status: "RUNNING",
      });
      const otherTask = await enqueueTask(db, otherSprintId, { taskType: "ANALYZE_PROBLEMS" });
      await testDb
        .update(vdTaskQueue)
        .set({ status: "FAILED", error: "Error", completedAt: new Date() })
        .where(eq(vdTaskQueue.id, otherTask.id));

      const tasks = await listFailedTasks(db, testSprintId);

      expect(tasks.length).toBe(1);
      expect(tasks[0].id).toBe(task.id);
    });

    it("completedAt 내림차순 정렬한다", async () => {
      const task1 = await enqueueTask(db, testSprintId, { taskType: "COLLECT_SIGNALS" });
      await testDb
        .update(vdTaskQueue)
        .set({ status: "FAILED", error: "Error1", completedAt: new Date(Date.now() - 1000) })
        .where(eq(vdTaskQueue.id, task1.id));

      const task2 = await enqueueTask(db, testSprintId, { taskType: "ANALYZE_PROBLEMS" });
      await testDb
        .update(vdTaskQueue)
        .set({ status: "FAILED", error: "Error2", completedAt: new Date() })
        .where(eq(vdTaskQueue.id, task2.id));

      const tasks = await listFailedTasks(db);

      // 최신 completedAt이 먼저
      expect(tasks[0].id).toBe(task2.id);
      expect(tasks[1].id).toBe(task1.id);
    });

    it("limit을 적용한다 (기본 20)", async () => {
      // 3개 생성
      for (let i = 0; i < 3; i++) {
        const task = await enqueueTask(db, testSprintId, { taskType: "COLLECT_SIGNALS" });
        await testDb
          .update(vdTaskQueue)
          .set({ status: "FAILED", error: `Error${i}`, completedAt: new Date() })
          .where(eq(vdTaskQueue.id, task.id));
      }

      const tasks = await listFailedTasks(db, undefined, 2);

      expect(tasks.length).toBe(2);
    });
  });

  describe("listStuckTasks", () => {
    it("RUNNING이고 startedAt이 timeoutMinutes 이전인 작업을 반환한다", async () => {
      const task = await enqueueTask(db, testSprintId, { taskType: "COLLECT_SIGNALS" });
      // 31분 전에 시작
      await testDb
        .update(vdTaskQueue)
        .set({ status: "RUNNING", startedAt: new Date(Date.now() - 31 * 60 * 1000) })
        .where(eq(vdTaskQueue.id, task.id));

      const stuck = await listStuckTasks(db, 30);

      expect(stuck.length).toBe(1);
      expect(stuck[0].id).toBe(task.id);
    });

    it("기본 timeoutMinutes는 30분이다", async () => {
      const task = await enqueueTask(db, testSprintId, { taskType: "COLLECT_SIGNALS" });
      // 31분 전에 시작
      await testDb
        .update(vdTaskQueue)
        .set({ status: "RUNNING", startedAt: new Date(Date.now() - 31 * 60 * 1000) })
        .where(eq(vdTaskQueue.id, task.id));

      const stuck = await listStuckTasks(db); // 기본값 30분

      expect(stuck.length).toBe(1);
    });

    it("커스텀 timeoutMinutes를 적용한다", async () => {
      const task = await enqueueTask(db, testSprintId, { taskType: "COLLECT_SIGNALS" });
      // 10분 전에 시작
      await testDb
        .update(vdTaskQueue)
        .set({ status: "RUNNING", startedAt: new Date(Date.now() - 10 * 60 * 1000) })
        .where(eq(vdTaskQueue.id, task.id));

      // 5분 timeout → 10분 전에 시작했으니 stuck
      const stuck5min = await listStuckTasks(db, 5);
      expect(stuck5min.length).toBe(1);

      // 15분 timeout → 10분 전에 시작했으니 아직 stuck 아님
      const stuck15min = await listStuckTasks(db, 15);
      expect(stuck15min.length).toBe(0);
    });
  });

  describe("deleteTask", () => {
    it("task를 삭제한다", async () => {
      const task = await enqueueTask(db, testSprintId, { taskType: "COLLECT_SIGNALS" });

      await deleteTask(db, task.id);

      const tasks = await listTasksBySprint(db, testSprintId);
      expect(tasks.length).toBe(0);
    });

    it("존재하지 않는 task도 에러 없이 처리한다", async () => {
      // 에러가 발생하지 않아야 함
      await expect(deleteTask(db, "non-existent-id")).resolves.not.toThrow();
    });
  });
});
