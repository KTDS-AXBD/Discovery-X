/**
 * Venture Worker 타입 정의
 */

export interface Env {
  DB: D1Database;
  ANTHROPIC_API_KEY: string;
  CRON_SECRET?: string;
  POLL_BATCH_SIZE: string;
  MAX_CONCURRENT: string;
  CLAUDE_MODEL: string;
}

// Task 타입
export type VdTaskTypeValue =
  | "COLLECT_SIGNALS"
  | "ANALYZE_PROBLEMS"
  | "GENERATE_OPPORTUNITIES"
  | "CLUSTER_THEMES"
  | "SCORE_OPPORTUNITIES"
  | "GENERATE_DEEPDIVE"
  | "GENERATE_ARTIFACTS"
  | "PREPARE_GATE";

export type VdTaskStatusType = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

// DB 타입 (D1 raw query 결과)
export interface VdTaskQueueRow {
  id: string;
  sprint_id: string;
  task_type: string;
  status: string;
  priority: number;
  input: string | null;
  output: string | null;
  error: string | null;
  retry_count: number;
  max_retries: number;
  started_at: number | null;
  completed_at: number | null;
  created_at: number;
  scheduled_at: number | null;
}

export interface VdTaskQueueItem {
  id: string;
  sprintId: string;
  taskType: VdTaskTypeValue;
  status: VdTaskStatusType;
  priority: number;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  retryCount: number;
  maxRetries: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  scheduledAt: Date | null;
}

// 디스패처 통계
export interface DispatcherStats {
  claimed: number;
  completed: number;
  failed: number;
  errors: string[];
}

// Claude API 타입
export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ClaudeTextBlock {
  type: "text";
  text: string;
}

export type ClaudeContentBlock = ClaudeTextBlock | ClaudeToolUseBlock;

export interface ClaudeResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: ClaudeContentBlock[];
  model: string;
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// Handler 인터페이스
export interface TaskHandler {
  taskType: VdTaskTypeValue;
  execute(env: Env, task: VdTaskQueueItem): Promise<Record<string, unknown>>;
}

// Sprint 관련 타입
export interface VdSprintRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  owner_id: string;
  started_at: number | null;
  completed_at: number | null;
  target_end_date: number | null;
  current_day: number;
  config: string | null;
  created_at: number;
  updated_at: number;
}

export interface VdSprintScopeRow {
  id: string;
  sprint_id: string;
  industry: string;
  function: string | null;
  technology: string | null;
  geography: string | null;
  keywords: string | null;
  exclusions: string | null;
  selected: number;
  created_at: number;
}

export interface VdSignalRow {
  id: string;
  sprint_id: string;
  signal_type: string;
  title: string;
  summary: string | null;
  source_url: string | null;
  source_title: string | null;
  published_at: number | null;
  relevance_score: number | null;
  metadata: string | null;
  created_at: number;
}

export interface VdProblemRow {
  id: string;
  sprint_id: string;
  statement: string;
  severity: number | null;
  frequency: number | null;
  target_segment: string | null;
  signal_ids: string | null;
  metadata: string | null;
  created_at: number;
}

export interface VdOpportunityRow {
  id: string;
  sprint_id: string;
  theme_id: string | null;
  title: string;
  description: string | null;
  problem_ids: string | null;
  target_segment: string | null;
  potential_score: number | null;
  confidence_score: number | null;
  depth_score: number | null;
  effort_score: number | null;
  recommendation: string | null;
  is_shortlisted: number;
  is_final: number;
  rank: number | null;
  metadata: string | null;
  created_at: number;
  updated_at: number;
}

export interface VdThemeRow {
  id: string;
  sprint_id: string;
  name: string;
  description: string | null;
  parent_theme_id: string | null;
  opportunity_count: number;
  depth_score: number | null;
  metadata: string | null;
  created_at: number;
}

export interface VdDecisionRow {
  id: string;
  sprint_id: string;
  decision_type: string;
  status: string;
  agent_recommendation: string | null;
  selected_option: string | null;
  human_rationale: string | null;
  decided_at: number | null;
  decided_by: string | null;
  timeout_at: number | null;
  created_at: number;
}
