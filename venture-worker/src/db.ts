/**
 * D1 데이터베이스 쿼리 헬퍼
 */

import type {
  VdTaskQueueRow,
  VdTaskQueueItem,
  VdTaskTypeValue,
  VdTaskStatusType,
  VdSprintRow,
  VdSprintScopeRow,
  VdSignalRow,
  VdProblemRow,
  VdOpportunityRow,
  VdThemeRow,
  VdDecisionRow,
} from "./types";

// ============================================================================
// TASK TYPE 의존성 설정
// ============================================================================

const VD_TASK_PRECEDING_TYPES: Record<VdTaskTypeValue, VdTaskTypeValue[]> = {
  COLLECT_SIGNALS: [],
  ANALYZE_PROBLEMS: ["COLLECT_SIGNALS"],
  GENERATE_OPPORTUNITIES: ["ANALYZE_PROBLEMS"],
  CLUSTER_THEMES: ["GENERATE_OPPORTUNITIES"],
  SCORE_OPPORTUNITIES: ["GENERATE_OPPORTUNITIES"],
  GENERATE_DEEPDIVE: ["PREPARE_GATE"],
  GENERATE_ARTIFACTS: ["GENERATE_DEEPDIVE"],
  PREPARE_GATE: ["SCORE_OPPORTUNITIES"],
};

function getPrecedingTaskTypes(taskType: VdTaskTypeValue): VdTaskTypeValue[] {
  return VD_TASK_PRECEDING_TYPES[taskType] || [];
}

// ============================================================================
// ROW → ITEM 변환
// ============================================================================

function rowToTask(row: VdTaskQueueRow): VdTaskQueueItem {
  return {
    id: row.id,
    sprintId: row.sprint_id,
    taskType: row.task_type as VdTaskTypeValue,
    status: row.status as VdTaskStatusType,
    priority: row.priority,
    input: row.input ? JSON.parse(row.input) : null,
    output: row.output ? JSON.parse(row.output) : null,
    error: row.error,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    startedAt: row.started_at ? new Date(row.started_at * 1000) : null,
    completedAt: row.completed_at ? new Date(row.completed_at * 1000) : null,
    createdAt: new Date(row.created_at * 1000),
    scheduledAt: row.scheduled_at ? new Date(row.scheduled_at * 1000) : null,
  };
}

// ============================================================================
// TASK QUEUE 쿼리
// ============================================================================

/**
 * 선행 task들이 모두 완료되었는지 확인
 */
async function arePrecedingTasksCompleted(
  db: D1Database,
  sprintId: string,
  taskType: VdTaskTypeValue
): Promise<boolean> {
  const precedingTypes = getPrecedingTaskTypes(taskType);
  if (precedingTypes.length === 0) return true;

  for (const precedingType of precedingTypes) {
    // 해당 타입의 task가 있는지, 그리고 완료(COMPLETED/FAILED)되었는지 확인
    const result = await db
      .prepare(
        `SELECT status FROM vd_task_queue
         WHERE sprint_id = ? AND task_type = ?`
      )
      .bind(sprintId, precedingType)
      .all<{ status: string }>();

    // 선행 타입의 task가 없으면 의존성 충족 안됨
    if (!result.results || result.results.length === 0) return false;

    // PENDING 또는 RUNNING인 task가 있으면 의존성 충족 안됨
    const hasIncomplete = result.results.some(
      (t) => t.status === "PENDING" || t.status === "RUNNING"
    );
    if (hasIncomplete) return false;
  }

  return true;
}

/**
 * PENDING 상태 Task를 claim하여 RUNNING으로 전환
 * - 선행 task 의존성 검증 포함
 */
export async function claimTasks(
  db: D1Database,
  limit: number = 5
): Promise<VdTaskQueueItem[]> {
  const nowEpoch = Math.floor(Date.now() / 1000);

  // 1. PENDING 상태이고 scheduled_at <= now인 Task 조회 (limit * 2로 여유있게)
  const result = await db
    .prepare(
      `SELECT * FROM vd_task_queue
       WHERE status = 'PENDING'
         AND (scheduled_at IS NULL OR scheduled_at <= ?)
       ORDER BY priority DESC, created_at ASC
       LIMIT ?`
    )
    .bind(nowEpoch, limit * 2)
    .all<VdTaskQueueRow>();

  if (!result.results || result.results.length === 0) {
    return [];
  }

  // 2. 각 Task의 의존성 검증 후 RUNNING으로 업데이트
  const claimedTasks: VdTaskQueueItem[] = [];

  for (const row of result.results) {
    if (claimedTasks.length >= limit) break;

    // 선행 task 의존성 검증
    const canClaim = await arePrecedingTasksCompleted(
      db,
      row.sprint_id,
      row.task_type as VdTaskTypeValue
    );

    if (!canClaim) continue;

    const updateResult = await db
      .prepare(
        `UPDATE vd_task_queue
         SET status = 'RUNNING', started_at = ?
         WHERE id = ? AND status = 'PENDING'`
      )
      .bind(nowEpoch, row.id)
      .run();

    if (updateResult.meta.changes > 0) {
      claimedTasks.push(
        rowToTask({
          ...row,
          status: "RUNNING",
          started_at: nowEpoch,
        })
      );
    }
  }

  return claimedTasks;
}

/**
 * Task 완료 처리
 */
export async function completeTask(
  db: D1Database,
  taskId: string,
  output?: Record<string, unknown>
): Promise<void> {
  const nowEpoch = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `UPDATE vd_task_queue
       SET status = 'COMPLETED',
           output = ?,
           completed_at = ?
       WHERE id = ?`
    )
    .bind(output ? JSON.stringify(output) : null, nowEpoch, taskId)
    .run();
}

/**
 * Task 실패 처리 (재시도 로직 포함)
 */
export async function failTask(
  db: D1Database,
  taskId: string,
  error: string,
  isRetryable: boolean = true
): Promise<void> {
  const nowEpoch = Math.floor(Date.now() / 1000);

  // 현재 Task 상태 조회
  const result = await db
    .prepare(`SELECT * FROM vd_task_queue WHERE id = ?`)
    .bind(taskId)
    .first<VdTaskQueueRow>();

  if (!result) return;

  const newRetryCount = result.retry_count + 1;

  if (isRetryable && newRetryCount < result.max_retries) {
    // 재시도: PENDING으로 복귀, 백오프 적용
    const backoffMinutes = Math.pow(2, newRetryCount); // 2, 4, 8, ...
    const scheduledAt = nowEpoch + backoffMinutes * 60;

    await db
      .prepare(
        `UPDATE vd_task_queue
         SET status = 'PENDING',
             retry_count = ?,
             error = ?,
             started_at = NULL,
             scheduled_at = ?
         WHERE id = ?`
      )
      .bind(newRetryCount, error, scheduledAt, taskId)
      .run();
  } else {
    // 최대 재시도 초과 또는 non-retryable: FAILED
    await db
      .prepare(
        `UPDATE vd_task_queue
         SET status = 'FAILED',
             retry_count = ?,
             error = ?,
             completed_at = ?
         WHERE id = ?`
      )
      .bind(newRetryCount, error, nowEpoch, taskId)
      .run();
  }
}

// ============================================================================
// SPRINT 쿼리
// ============================================================================

export async function getSprint(
  db: D1Database,
  sprintId: string
): Promise<VdSprintRow | null> {
  return db
    .prepare(`SELECT * FROM vd_sprints WHERE id = ?`)
    .bind(sprintId)
    .first<VdSprintRow>();
}

export async function getSprintScopes(
  db: D1Database,
  sprintId: string,
  selectedOnly: boolean = false
): Promise<VdSprintScopeRow[]> {
  const query = selectedOnly
    ? `SELECT * FROM vd_sprint_scopes WHERE sprint_id = ? AND selected = 1`
    : `SELECT * FROM vd_sprint_scopes WHERE sprint_id = ?`;

  const result = await db.prepare(query).bind(sprintId).all<VdSprintScopeRow>();
  return result.results || [];
}

// ============================================================================
// SIGNAL 쿼리
// ============================================================================

export async function getSignals(
  db: D1Database,
  sprintId: string,
  signalIds?: string[]
): Promise<VdSignalRow[]> {
  if (signalIds && signalIds.length > 0) {
    const placeholders = signalIds.map(() => "?").join(",");
    const result = await db
      .prepare(
        `SELECT * FROM vd_signals WHERE sprint_id = ? AND id IN (${placeholders})`
      )
      .bind(sprintId, ...signalIds)
      .all<VdSignalRow>();
    return result.results || [];
  }

  const result = await db
    .prepare(`SELECT * FROM vd_signals WHERE sprint_id = ? ORDER BY created_at DESC`)
    .bind(sprintId)
    .all<VdSignalRow>();
  return result.results || [];
}

export async function insertSignal(
  db: D1Database,
  signal: Omit<VdSignalRow, "created_at">
): Promise<void> {
  const nowEpoch = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO vd_signals (id, sprint_id, signal_type, title, summary, source_url, source_title, published_at, relevance_score, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      signal.id,
      signal.sprint_id,
      signal.signal_type,
      signal.title,
      signal.summary,
      signal.source_url,
      signal.source_title,
      signal.published_at,
      signal.relevance_score,
      signal.metadata,
      nowEpoch
    )
    .run();
}

// ============================================================================
// PROBLEM 쿼리
// ============================================================================

export async function getProblems(
  db: D1Database,
  sprintId: string,
  problemIds?: string[]
): Promise<VdProblemRow[]> {
  if (problemIds && problemIds.length > 0) {
    const placeholders = problemIds.map(() => "?").join(",");
    const result = await db
      .prepare(
        `SELECT * FROM vd_problems WHERE sprint_id = ? AND id IN (${placeholders})`
      )
      .bind(sprintId, ...problemIds)
      .all<VdProblemRow>();
    return result.results || [];
  }

  const result = await db
    .prepare(`SELECT * FROM vd_problems WHERE sprint_id = ? ORDER BY created_at DESC`)
    .bind(sprintId)
    .all<VdProblemRow>();
  return result.results || [];
}

export async function insertProblem(
  db: D1Database,
  problem: Omit<VdProblemRow, "created_at">
): Promise<void> {
  const nowEpoch = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO vd_problems (id, sprint_id, statement, severity, frequency, target_segment, signal_ids, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      problem.id,
      problem.sprint_id,
      problem.statement,
      problem.severity,
      problem.frequency,
      problem.target_segment,
      problem.signal_ids,
      problem.metadata,
      nowEpoch
    )
    .run();
}

// ============================================================================
// OPPORTUNITY 쿼리
// ============================================================================

export async function getOpportunities(
  db: D1Database,
  sprintId: string,
  opportunityIds?: string[]
): Promise<VdOpportunityRow[]> {
  if (opportunityIds && opportunityIds.length > 0) {
    const placeholders = opportunityIds.map(() => "?").join(",");
    const result = await db
      .prepare(
        `SELECT * FROM vd_opportunities WHERE sprint_id = ? AND id IN (${placeholders})`
      )
      .bind(sprintId, ...opportunityIds)
      .all<VdOpportunityRow>();
    return result.results || [];
  }

  const result = await db
    .prepare(`SELECT * FROM vd_opportunities WHERE sprint_id = ? ORDER BY created_at DESC`)
    .bind(sprintId)
    .all<VdOpportunityRow>();
  return result.results || [];
}

export async function insertOpportunity(
  db: D1Database,
  opportunity: Omit<VdOpportunityRow, "created_at" | "updated_at">
): Promise<void> {
  const nowEpoch = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO vd_opportunities (id, sprint_id, theme_id, title, description, problem_ids, target_segment, potential_score, confidence_score, depth_score, effort_score, recommendation, is_shortlisted, is_final, rank, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      opportunity.id,
      opportunity.sprint_id,
      opportunity.theme_id,
      opportunity.title,
      opportunity.description,
      opportunity.problem_ids,
      opportunity.target_segment,
      opportunity.potential_score,
      opportunity.confidence_score,
      opportunity.depth_score,
      opportunity.effort_score,
      opportunity.recommendation,
      opportunity.is_shortlisted,
      opportunity.is_final,
      opportunity.rank,
      opportunity.metadata,
      nowEpoch,
      nowEpoch
    )
    .run();
}

export async function updateOpportunityScores(
  db: D1Database,
  opportunityId: string,
  scores: {
    potentialScore?: number;
    confidenceScore?: number;
    depthScore?: number;
    effortScore?: number;
    recommendation?: string;
  }
): Promise<void> {
  const nowEpoch = Math.floor(Date.now() / 1000);
  const updates: string[] = [];
  const values: (number | string | null)[] = [];

  if (scores.potentialScore !== undefined) {
    updates.push("potential_score = ?");
    values.push(scores.potentialScore);
  }
  if (scores.confidenceScore !== undefined) {
    updates.push("confidence_score = ?");
    values.push(scores.confidenceScore);
  }
  if (scores.depthScore !== undefined) {
    updates.push("depth_score = ?");
    values.push(scores.depthScore);
  }
  if (scores.effortScore !== undefined) {
    updates.push("effort_score = ?");
    values.push(scores.effortScore);
  }
  if (scores.recommendation !== undefined) {
    updates.push("recommendation = ?");
    values.push(scores.recommendation);
  }

  if (updates.length === 0) return;

  updates.push("updated_at = ?");
  values.push(nowEpoch);
  values.push(opportunityId);

  await db
    .prepare(`UPDATE vd_opportunities SET ${updates.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
}

// ============================================================================
// THEME 쿼리
// ============================================================================

export async function getThemes(
  db: D1Database,
  sprintId: string
): Promise<VdThemeRow[]> {
  const result = await db
    .prepare(`SELECT * FROM vd_themes WHERE sprint_id = ? ORDER BY name ASC`)
    .bind(sprintId)
    .all<VdThemeRow>();
  return result.results || [];
}

export async function insertTheme(
  db: D1Database,
  theme: Omit<VdThemeRow, "created_at">
): Promise<void> {
  const nowEpoch = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO vd_themes (id, sprint_id, name, description, parent_theme_id, opportunity_count, depth_score, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      theme.id,
      theme.sprint_id,
      theme.name,
      theme.description,
      theme.parent_theme_id,
      theme.opportunity_count,
      theme.depth_score,
      theme.metadata,
      nowEpoch
    )
    .run();
}

export async function updateOpportunityTheme(
  db: D1Database,
  opportunityId: string,
  themeId: string
): Promise<void> {
  const nowEpoch = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `UPDATE vd_opportunities SET theme_id = ?, updated_at = ? WHERE id = ?`
    )
    .bind(themeId, nowEpoch, opportunityId)
    .run();
}

// ============================================================================
// DECISION 쿼리
// ============================================================================

export async function getDecision(
  db: D1Database,
  sprintId: string,
  decisionType: string
): Promise<VdDecisionRow | null> {
  return db
    .prepare(
      `SELECT * FROM vd_decisions WHERE sprint_id = ? AND decision_type = ? ORDER BY created_at DESC LIMIT 1`
    )
    .bind(sprintId, decisionType)
    .first<VdDecisionRow>();
}

export async function insertDecision(
  db: D1Database,
  decision: Omit<VdDecisionRow, "created_at">
): Promise<void> {
  const nowEpoch = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO vd_decisions (id, sprint_id, decision_type, status, agent_recommendation, selected_option, human_rationale, decided_at, decided_by, timeout_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      decision.id,
      decision.sprint_id,
      decision.decision_type,
      decision.status,
      decision.agent_recommendation,
      decision.selected_option,
      decision.human_rationale,
      decision.decided_at,
      decision.decided_by,
      decision.timeout_at,
      nowEpoch
    )
    .run();
}

// ============================================================================
// ASSUMPTION & PREMORTEM 쿼리
// ============================================================================

export async function insertAssumption(
  db: D1Database,
  assumption: {
    id: string;
    opportunityId: string;
    statement: string;
    criticality?: number;
    confidence?: number;
    validationMethod?: string;
    status?: string;
    evidenceIds?: string[];
  }
): Promise<void> {
  const nowEpoch = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO vd_assumptions (id, opportunity_id, statement, criticality, confidence, validation_method, status, evidence_ids, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      assumption.id,
      assumption.opportunityId,
      assumption.statement,
      assumption.criticality ?? null,
      assumption.confidence ?? null,
      assumption.validationMethod ?? null,
      assumption.status ?? "OPEN",
      assumption.evidenceIds ? JSON.stringify(assumption.evidenceIds) : null,
      nowEpoch
    )
    .run();
}

export async function insertPremortem(
  db: D1Database,
  premortem: {
    id: string;
    opportunityId: string;
    failureScenario: string;
    probability?: number;
    impact?: number;
    mitigationStrategy?: string;
  }
): Promise<void> {
  const nowEpoch = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO vd_premortems (id, opportunity_id, failure_scenario, probability, impact, mitigation_strategy, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      premortem.id,
      premortem.opportunityId,
      premortem.failureScenario,
      premortem.probability ?? null,
      premortem.impact ?? null,
      premortem.mitigationStrategy ?? null,
      nowEpoch
    )
    .run();
}

// ============================================================================
// ARTIFACT 쿼리
// ============================================================================

export async function insertArtifact(
  db: D1Database,
  artifact: {
    id: string;
    opportunityId: string;
    artifactType: string;
    title: string;
    content?: Record<string, unknown>;
    version?: number;
  }
): Promise<void> {
  const nowEpoch = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO vd_artifacts (id, opportunity_id, artifact_type, title, content, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      artifact.id,
      artifact.opportunityId,
      artifact.artifactType,
      artifact.title,
      artifact.content ? JSON.stringify(artifact.content) : null,
      artifact.version ?? 1,
      nowEpoch,
      nowEpoch
    )
    .run();
}

// ============================================================================
// WORK EVENT 쿼리
// ============================================================================

export async function insertWorkEvent(
  db: D1Database,
  event: {
    id: string;
    sprintId: string;
    eventType: string;
    actorType: "agent" | "human";
    actorId?: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const nowEpoch = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO vd_work_events (id, sprint_id, event_type, actor_type, actor_id, entity_type, entity_id, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      event.id,
      event.sprintId,
      event.eventType,
      event.actorType,
      event.actorId ?? null,
      event.entityType ?? null,
      event.entityId ?? null,
      event.metadata ? JSON.stringify(event.metadata) : null,
      nowEpoch
    )
    .run();
}
