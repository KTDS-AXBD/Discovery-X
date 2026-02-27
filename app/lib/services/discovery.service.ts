/**
 * DiscoveryService — Facade.
 * 실제 구현은 discovery/ 서브모듈 참조.
 */
import type { DB } from "~/db";
import { DiscoveryQueryService } from "./discovery/query";
import { DiscoveryWorkflowService } from "./discovery/workflow";
import { DiscoveryEntityService } from "./discovery/entity";

// re-export types for backward compat
export type {
  Discovery,
  Experiment,
  Evidence,
  User,
  DiscoveryListItem,
  DiscoveryListParams,
  DiscoveryDetail,
  CreateDiscoveryInput,
  ChangeOwnerInput,
  PromoteInput,
  SubmitApprovalInput,
  AddExperimentInput,
  AddEvidenceInput,
  CompleteExperimentInput,
  ChangeReviewerInput,
  ChangeGatekeeperInput,
  UpdateDiscoveryInput,
  RequestExtensionInput,
  ApproveDecisionResult,
  KpiWithMeasurements,
  DiscoveryLinksResult,
  LinkWithDirection,
  ActivityLogWithActor,
  WeeklyReviewItem,
  RecallQueueItem,
  DiscoveryExportRow,
} from "./discovery/types";

export class DiscoveryService {
  private query: DiscoveryQueryService;
  private workflow: DiscoveryWorkflowService;
  private entity: DiscoveryEntityService;

  constructor(db: DB) {
    this.query = new DiscoveryQueryService(db);
    this.workflow = new DiscoveryWorkflowService(db);
    this.entity = new DiscoveryEntityService(db);
  }

  // --- Query delegates ---
  list = (...args: Parameters<DiscoveryQueryService["list"]>) =>
    this.query.list(...args);
  getById = (...args: Parameters<DiscoveryQueryService["getById"]>) =>
    this.query.getById(...args);
  getDetail = (...args: Parameters<DiscoveryQueryService["getDetail"]>) =>
    this.query.getDetail(...args);
  getActivityLogs = (
    ...args: Parameters<DiscoveryQueryService["getActivityLogs"]>
  ) => this.query.getActivityLogs(...args);
  getExperimentCount = (
    ...args: Parameters<DiscoveryQueryService["getExperimentCount"]>
  ) => this.query.getExperimentCount(...args);
  getKpisWithMeasurements = (
    ...args: Parameters<DiscoveryQueryService["getKpisWithMeasurements"]>
  ) => this.query.getKpisWithMeasurements(...args);
  getLinksWithDiscoveries = (
    ...args: Parameters<DiscoveryQueryService["getLinksWithDiscoveries"]>
  ) => this.query.getLinksWithDiscoveries(...args);
  getActivityLogsWithActors = (
    ...args: Parameters<DiscoveryQueryService["getActivityLogsWithActors"]>
  ) => this.query.getActivityLogsWithActors(...args);
  getAllUsers = () => this.query.getAllUsers();
  listForWeeklyReview = (
    ...args: Parameters<DiscoveryQueryService["listForWeeklyReview"]>
  ) => this.query.listForWeeklyReview(...args);
  listForRecallQueue = (
    ...args: Parameters<DiscoveryQueryService["listForRecallQueue"]>
  ) => this.query.listForRecallQueue(...args);
  getForExport = (
    ...args: Parameters<DiscoveryQueryService["getForExport"]>
  ) => this.query.getForExport(...args);

  // --- Workflow delegates ---
  transition = (...args: Parameters<DiscoveryWorkflowService["transition"]>) =>
    this.workflow.transition(...args);
  changeOwner = (
    ...args: Parameters<DiscoveryWorkflowService["changeOwner"]>
  ) => this.workflow.changeOwner(...args);
  getAllowedTransitions = (
    ...args: Parameters<DiscoveryWorkflowService["getAllowedTransitions"]>
  ) => this.workflow.getAllowedTransitions(...args);
  promote = (...args: Parameters<DiscoveryWorkflowService["promote"]>) =>
    this.workflow.promote(...args);
  submitForApproval = (
    ...args: Parameters<DiscoveryWorkflowService["submitForApproval"]>
  ) => this.workflow.submitForApproval(...args);
  approveDecision = (
    ...args: Parameters<DiscoveryWorkflowService["approveDecision"]>
  ) => this.workflow.approveDecision(...args);
  rejectDecision = (
    ...args: Parameters<DiscoveryWorkflowService["rejectDecision"]>
  ) => this.workflow.rejectDecision(...args);
  requestExtension = (
    ...args: Parameters<DiscoveryWorkflowService["requestExtension"]>
  ) => this.workflow.requestExtension(...args);
  changeReviewer = (
    ...args: Parameters<DiscoveryWorkflowService["changeReviewer"]>
  ) => this.workflow.changeReviewer(...args);
  changeGatekeeper = (
    ...args: Parameters<DiscoveryWorkflowService["changeGatekeeper"]>
  ) => this.workflow.changeGatekeeper(...args);

  // --- Entity delegates ---
  create = (...args: Parameters<DiscoveryEntityService["create"]>) =>
    this.entity.create(...args);
  update = (...args: Parameters<DiscoveryEntityService["update"]>) =>
    this.entity.update(...args);
  addExperiment = (
    ...args: Parameters<DiscoveryEntityService["addExperiment"]>
  ) => this.entity.addExperiment(...args);
  addEvidence = (...args: Parameters<DiscoveryEntityService["addEvidence"]>) =>
    this.entity.addEvidence(...args);
  completeExperiment = (
    ...args: Parameters<DiscoveryEntityService["completeExperiment"]>
  ) => this.entity.completeExperiment(...args);
}
