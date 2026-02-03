/**
 * 핸들러 레지스트리
 */

import type { TaskHandler, VdTaskTypeValue } from "../types";

import { collectSignalsHandler } from "./collect-signals";
import { analyzeProblemsHandler } from "./analyze-problems";
import { generateOpportunitiesHandler } from "./generate-opportunities";
import { clusterThemesHandler } from "./cluster-themes";
import { scoreOpportunitiesHandler } from "./score-opportunities";
import { generateDeepDiveHandler } from "./generate-deepdive";
import { generateArtifactsHandler } from "./generate-artifacts";
import { prepareGateHandler } from "./prepare-gate";

// 핸들러 레지스트리
const handlers: Map<VdTaskTypeValue, TaskHandler> = new Map([
  ["COLLECT_SIGNALS", collectSignalsHandler],
  ["ANALYZE_PROBLEMS", analyzeProblemsHandler],
  ["GENERATE_OPPORTUNITIES", generateOpportunitiesHandler],
  ["CLUSTER_THEMES", clusterThemesHandler],
  ["SCORE_OPPORTUNITIES", scoreOpportunitiesHandler],
  ["GENERATE_DEEPDIVE", generateDeepDiveHandler],
  ["GENERATE_ARTIFACTS", generateArtifactsHandler],
  ["PREPARE_GATE", prepareGateHandler],
]);

/**
 * Task 타입에 해당하는 핸들러 가져오기
 */
export function getHandler(taskType: VdTaskTypeValue): TaskHandler {
  const handler = handlers.get(taskType);
  if (!handler) {
    throw new Error(`No handler found for task type: ${taskType}`);
  }
  return handler;
}

/**
 * 지원하는 모든 Task 타입 가져오기
 */
export function getSupportedTaskTypes(): VdTaskTypeValue[] {
  return Array.from(handlers.keys());
}
