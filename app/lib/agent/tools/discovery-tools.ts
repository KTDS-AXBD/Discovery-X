/**
 * Discovery management tools — re-export barrel.
 * 실제 구현은 discovery-crud.ts, discovery-experiment.ts, discovery-decision.ts 참조.
 */

export {
  createDiscovery,
  updateDiscovery,
  promoteDiscovery,
  transitionStage,
  tagDiscovery,
  removeDiscoveryTag,
} from "./discovery-crud";

export {
  addExperiment,
  completeExperiment,
  addEvidence,
  getStageInfo,
  validateEvidence,
} from "./discovery-experiment";

export {
  decideGate,
  decideHold,
  decideDrop,
  requestExtension,
  generateIdeaCandidates,
  selectIdeaCandidate,
  autoFillTemplate,
} from "./discovery-decision";
