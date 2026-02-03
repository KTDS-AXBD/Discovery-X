/**
 * Venture Task Queue Repository
 */

import { eq, desc, and, lte, asc } from "drizzle-orm";
import type { DB } from "~/db";
import { vdTaskQueue, type VdTaskQueueItem, type NewVdTaskQueueItem } from "../db/schema";
import type { VdTaskTypeValue, VdTaskStatusType } from "../types";
import { getTaskMaxRetries, getTaskDefaultPriority } from "../constants/task-types";

// ============================================================================
// TASK QUEUE CRUD
// ============================================================================

export interface EnqueueTaskInput {
  taskType: VdTaskTypeValue;
  input?: Record<string, unknown>;
  priority?: number;
  scheduledAt?: Date;
}

export async function enqueueTask(
  db: DB,
  sprintId: string,
  taskInput: EnqueueTaskInput
): Promise<VdTaskQueueItem> {
  const id = crypto.randomUUID();
  const now = new Date();

  const task: NewVdTaskQueueItem = {
    id,
    sprintId,
    taskType: taskInput.taskType,
    status: "PENDING",
    priority: taskInput.priority ?? getTaskDefaultPriority(taskInput.taskType),
    input: taskInput.input,
    maxRetries: getTaskMaxRetries(taskInput.taskType),
    retryCount: 0,
    scheduledAt: taskInput.scheduledAt ?? now,
    createdAt: now,
  };

  await db.insert(vdTaskQueue).values(task);

  return {
    ...task,
    output: null,
    error: null,
    startedAt: null,
    completedAt: null,
  } as VdTaskQueueItem;
}

export async function getTaskById(db: DB, taskId: string): Promise<VdTaskQueueItem | null> {
  const results = await db.select().from(vdTaskQueue).where(eq(vdTaskQueue.id, taskId)).limit(1);
  return results[0] || null;
}

/**
 * Worker가 작업을 가져가기 (claim)
 * - status=PENDING AND scheduledAt <= now
 * - 우선순위 높은 순, 생성 시간 순
 */
export async function claimTasks(db: DB, limit: number = 5): Promise<VdTaskQueueItem[]> {
  const now = new Date();

  // 1. PENDING 상태이고 예약 시간이 지난 작업 조회
  const pendingTasks = await db
    .select()
    .from(vdTaskQueue)
    .where(and(eq(vdTaskQueue.status, "PENDING"), lte(vdTaskQueue.scheduledAt, now)))
    .orderBy(desc(vdTaskQueue.priority), asc(vdTaskQueue.createdAt))
    .limit(limit);

  if (pendingTasks.length === 0) {
    return [];
  }

  // 2. 각 작업을 RUNNING으로 업데이트 (낙관적 락)
  const claimedTasks: VdTaskQueueItem[] = [];

  for (const task of pendingTasks) {
    await db
      .update(vdTaskQueue)
      .set({
        status: "RUNNING",
        startedAt: now,
      })
      .where(and(eq(vdTaskQueue.id, task.id), eq(vdTaskQueue.status, "PENDING")));

    claimedTasks.push({
      ...task,
      status: "RUNNING",
      startedAt: now,
    });
  }

  return claimedTasks;
}

/**
 * 작업 완료 보고
 */
export async function completeTask(
  db: DB,
  taskId: string,
  output?: Record<string, unknown>
): Promise<VdTaskQueueItem | null> {
  const existing = await getTaskById(db, taskId);
  if (!existing) return null;

  const now = new Date();
  const updates: Partial<VdTaskQueueItem> = {
    status: "COMPLETED",
    output,
    completedAt: now,
  };

  await db.update(vdTaskQueue).set(updates).where(eq(vdTaskQueue.id, taskId));

  return { ...existing, ...updates };
}

/**
 * 작업 실패 보고
 * - 재시도 가능하면 PENDING으로 복귀
 * - 최대 재시도 초과 시 FAILED
 */
export async function failTask(
  db: DB,
  taskId: string,
  error: string
): Promise<VdTaskQueueItem | null> {
  const existing = await getTaskById(db, taskId);
  if (!existing) return null;

  const now = new Date();
  const newRetryCount = existing.retryCount + 1;

  let updates: Partial<VdTaskQueueItem>;

  if (newRetryCount < existing.maxRetries) {
    // 재시도: PENDING으로 복귀, 백오프 적용
    const backoffMinutes = Math.pow(2, newRetryCount); // 2, 4, 8, ...
    const scheduledAt = new Date(now.getTime() + backoffMinutes * 60 * 1000);

    updates = {
      status: "PENDING",
      retryCount: newRetryCount,
      error,
      startedAt: null,
      scheduledAt,
    };
  } else {
    // 최대 재시도 초과: FAILED
    updates = {
      status: "FAILED",
      retryCount: newRetryCount,
      error,
      completedAt: now,
    };
  }

  await db.update(vdTaskQueue).set(updates).where(eq(vdTaskQueue.id, taskId));

  return { ...existing, ...updates };
}

/**
 * 스프린트별 작업 목록 조회
 */
export async function listTasksBySprint(
  db: DB,
  sprintId: string,
  filter?: {
    status?: VdTaskStatusType;
    taskType?: VdTaskTypeValue;
    limit?: number;
  }
): Promise<VdTaskQueueItem[]> {
  const conditions = [eq(vdTaskQueue.sprintId, sprintId)];

  if (filter?.status) {
    conditions.push(eq(vdTaskQueue.status, filter.status));
  }
  if (filter?.taskType) {
    conditions.push(eq(vdTaskQueue.taskType, filter.taskType));
  }

  let query = db
    .select()
    .from(vdTaskQueue)
    .where(and(...conditions))
    .orderBy(desc(vdTaskQueue.createdAt));

  if (filter?.limit) {
    query = query.limit(filter.limit) as typeof query;
  }

  return query;
}

/**
 * PENDING 상태 작업 수 조회
 */
export async function getPendingTaskCount(db: DB, sprintId?: string): Promise<number> {
  const conditions = [eq(vdTaskQueue.status, "PENDING")];

  if (sprintId) {
    conditions.push(eq(vdTaskQueue.sprintId, sprintId));
  }

  const results = await db
    .select()
    .from(vdTaskQueue)
    .where(and(...conditions));

  return results.length;
}

/**
 * RUNNING 상태 작업 수 조회
 */
export async function getRunningTaskCount(db: DB, sprintId?: string): Promise<number> {
  const conditions = [eq(vdTaskQueue.status, "RUNNING")];

  if (sprintId) {
    conditions.push(eq(vdTaskQueue.sprintId, sprintId));
  }

  const results = await db
    .select()
    .from(vdTaskQueue)
    .where(and(...conditions));

  return results.length;
}

/**
 * FAILED 상태 작업 조회 (재시도 불가)
 */
export async function listFailedTasks(db: DB, sprintId?: string, limit: number = 20): Promise<VdTaskQueueItem[]> {
  const conditions = [eq(vdTaskQueue.status, "FAILED")];

  if (sprintId) {
    conditions.push(eq(vdTaskQueue.sprintId, sprintId));
  }

  return db
    .select()
    .from(vdTaskQueue)
    .where(and(...conditions))
    .orderBy(desc(vdTaskQueue.completedAt))
    .limit(limit);
}

/**
 * 오래된 RUNNING 작업 조회 (타임아웃 후보)
 */
export async function listStuckTasks(
  db: DB,
  timeoutMinutes: number = 30
): Promise<VdTaskQueueItem[]> {
  const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);

  return db
    .select()
    .from(vdTaskQueue)
    .where(and(eq(vdTaskQueue.status, "RUNNING"), lte(vdTaskQueue.startedAt, cutoff)));
}

/**
 * 작업 삭제
 */
export async function deleteTask(db: DB, taskId: string): Promise<void> {
  await db.delete(vdTaskQueue).where(eq(vdTaskQueue.id, taskId));
}
