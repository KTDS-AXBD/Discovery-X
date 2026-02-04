/**
 * Venture Task Queue Repository
 */

import { eq, desc, and, lte, asc } from "drizzle-orm";
import type { DB } from "~/db";
import { vdTaskQueue, type VdTaskQueueItem, type NewVdTaskQueueItem } from "../db/schema";
import type { VdTaskTypeValue, VdTaskStatusType } from "../types";
import { getTaskMaxRetries, getTaskDefaultPriority, getPrecedingTaskTypes } from "../constants/task-types";
import {
  type ErrorClassification,
  getEffectiveMaxRetries,
} from "../utils/error-classifier";

// ============================================================================
// BACKOFF CONFIGURATION
// ============================================================================

const BACKOFF_BASE_SECONDS = 30; // 30초 base
const BACKOFF_MAX_SECONDS = 30 * 60; // 30분 cap

/**
 * Exponential backoff with jitter 계산
 * - base: 30초
 * - exponential: 30 * 2^retryCount
 * - cap: 30분
 * - jitter: 0.8~1.2
 */
function calculateBackoffMs(retryCount: number): number {
  // exponential: 30 * 2^retryCount (초)
  const rawSeconds = BACKOFF_BASE_SECONDS * Math.pow(2, retryCount);
  // 30분 캡
  const cappedSeconds = Math.min(rawSeconds, BACKOFF_MAX_SECONDS);
  // jitter 0.8~1.2
  const jitter = 0.8 + Math.random() * 0.4;
  return Math.floor(cappedSeconds * jitter * 1000); // ms로 반환
}

// ============================================================================
// TASK QUEUE CRUD
// ============================================================================

export interface EnqueueTaskInput {
  taskType: VdTaskTypeValue;
  input?: Record<string, unknown>;
  priority?: number;
  scheduledAt?: Date;
  dedupeKey?: string; // Idempotency key
}

export async function enqueueTask(
  db: DB,
  sprintId: string,
  taskInput: EnqueueTaskInput
): Promise<VdTaskQueueItem> {
  // Idempotency: dedupeKey가 있으면 기존 task 확인
  if (taskInput.dedupeKey) {
    const existing = await db
      .select()
      .from(vdTaskQueue)
      .where(eq(vdTaskQueue.dedupeKey, taskInput.dedupeKey))
      .limit(1);

    if (existing.length > 0) {
      return existing[0]; // 기존 task 반환 (중복 방지)
    }
  }

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
    dedupeKey: taskInput.dedupeKey ?? null,
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
 * 선행 task들이 모두 완료되었는지 확인
 * - 같은 스프린트 내에서 선행 타입의 task가 COMPLETED 또는 FAILED 상태여야 함
 * - FAILED도 "완료"로 간주하여 후행 task 실행 허용 (에러 전파 방지)
 */
async function arePrecedingTasksCompleted(
  db: DB,
  sprintId: string,
  taskType: VdTaskTypeValue
): Promise<boolean> {
  const precedingTypes = getPrecedingTaskTypes(taskType);
  if (precedingTypes.length === 0) return true;

  for (const precedingType of precedingTypes) {
    // 해당 타입의 task가 있는지, 그리고 완료(COMPLETED/FAILED)되었는지 확인
    const tasks = await db
      .select()
      .from(vdTaskQueue)
      .where(
        and(
          eq(vdTaskQueue.sprintId, sprintId),
          eq(vdTaskQueue.taskType, precedingType)
        )
      );

    // 선행 타입의 task가 없으면 의존성 충족 안됨
    if (tasks.length === 0) return false;

    // PENDING 또는 RUNNING인 task가 있으면 의존성 충족 안됨
    const hasIncomplete = tasks.some(
      (t) => t.status === "PENDING" || t.status === "RUNNING"
    );
    if (hasIncomplete) return false;
  }

  return true;
}

/**
 * Worker가 작업을 가져가기 (claim)
 * - status=PENDING AND scheduledAt <= now
 * - 선행 task 의존성 검증
 * - 우선순위 높은 순, 생성 시간 순
 */
export async function claimTasks(db: DB, limit: number = 5): Promise<VdTaskQueueItem[]> {
  const now = new Date();

  // 1. PENDING 상태이고 예약 시간이 지난 작업 조회 (limit * 2로 여유있게)
  const pendingTasks = await db
    .select()
    .from(vdTaskQueue)
    .where(and(eq(vdTaskQueue.status, "PENDING"), lte(vdTaskQueue.scheduledAt, now)))
    .orderBy(desc(vdTaskQueue.priority), asc(vdTaskQueue.createdAt))
    .limit(limit * 2);

  if (pendingTasks.length === 0) {
    return [];
  }

  // 2. 각 작업의 의존성 검증 후 RUNNING으로 업데이트 (낙관적 락)
  const claimedTasks: VdTaskQueueItem[] = [];

  for (const task of pendingTasks) {
    if (claimedTasks.length >= limit) break;

    // 선행 task 의존성 검증
    const canClaim = await arePrecedingTasksCompleted(
      db,
      task.sprintId,
      task.taskType as VdTaskTypeValue
    );

    if (!canClaim) continue;

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
 * - 에러 분류에 따라 재시도 정책 적용
 * - non-retryable: 즉시 FAILED
 * - repair: 최대 3회 재시도
 * - retryable: maxRetries까지 재시도 (30초 base, 30분 cap, jitter 0.8~1.2)
 */
export async function failTask(
  db: DB,
  taskId: string,
  error: string,
  errorType?: ErrorClassification
): Promise<VdTaskQueueItem | null> {
  const existing = await getTaskById(db, taskId);
  if (!existing) return null;

  const now = new Date();
  const newRetryCount = existing.retryCount + 1;

  // 에러 분류에 따른 최대 재시도 횟수 결정
  const effectiveMaxRetries = errorType
    ? getEffectiveMaxRetries(existing.maxRetries, errorType)
    : existing.maxRetries;

  let updates: Partial<VdTaskQueueItem>;

  // non-retryable이면 즉시 FAILED
  if (errorType === "non-retryable") {
    updates = {
      status: "FAILED",
      retryCount: newRetryCount,
      error,
      completedAt: now,
    };
  } else if (newRetryCount < effectiveMaxRetries) {
    // 재시도: PENDING으로 복귀, 백오프 적용
    const backoffMs = calculateBackoffMs(newRetryCount);
    const scheduledAt = new Date(now.getTime() + backoffMs);

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
