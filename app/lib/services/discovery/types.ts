import type { discoveries, experiments, evidence, users, discoveryKpis, discoveryLinks } from "~/db/schema";

// ============================================================================
// Types
// ============================================================================

export type Discovery = typeof discoveries.$inferSelect;
export type Experiment = typeof experiments.$inferSelect;
export type Evidence = typeof evidence.$inferSelect;
export type User = typeof users.$inferSelect;

export interface DiscoveryListItem extends Discovery {
  ownerName: string | undefined;
  isInboxOverdue: boolean;
  isOpenOverdue: boolean;
}

export interface DiscoveryListParams {
  tenantId: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface DiscoveryDetail {
  discovery: Discovery;
  owner: User | null;
  reviewer: User | null;
  gatekeeper: User | null;
  experiments: Experiment[];
  evidence: Evidence[];
}

export interface CreateDiscoveryInput {
  title: string;
  seedSummary: string;
  seedLinks?: string[] | null;
  sourceType: string;
  ownerId: string;
  tenantId: string;
  sourceIdeaId?: string | null;
  createdByAgent?: boolean;
}

export interface ChangeOwnerInput {
  discoveryId: string;
  newOwnerId: string;
  actorId: string;
  handoverNote?: string;
}

export interface PromoteInput {
  ownerId: string;
  reviewerId?: string | null;
  firstExperiment: {
    hypothesis: string;
    minimalAction: string;
    deadline: Date;
    expectedEvidence: string;
  };
}

export interface SubmitApprovalInput {
  pendingDecision: string;
  pendingDecisionData: Record<string, unknown>;
}

export interface AddExperimentInput {
  hypothesis: string;
  minimalAction: string;
  deadline: Date;
  expectedEvidence: string;
}

export interface AddEvidenceInput {
  type: string;
  strength: string;
  content: string;
  linkOrAttachment?: string | null;
  experimentId?: string | null;
  reliabilityLabel?: string;
  sourceUrl?: string | null;
  publishedOrObservedDate?: string | null;
  createdById: string;
}

export interface CompleteExperimentInput {
  experimentId: string;
  resultSummary: string;
}

export interface ChangeReviewerInput {
  discoveryId: string;
  newReviewerId: string | null;
  actorId: string;
}

export interface ChangeGatekeeperInput {
  discoveryId: string;
  newGatekeeperId: string | null;
  actorId: string;
}

export interface UpdateDiscoveryInput {
  title: string;
  seedSummary: string;
  seedLinks?: string[] | null;
  sourceType: string;
  targetSegment?: string | null;
  valueProposition?: string | null;
}

export interface RequestExtensionInput {
  extensionRationale: string;
  previousDueDate: Date | null;
  newDueDate: Date;
}

export interface ApproveDecisionResult {
  pendingDecision: string | null;
}

// ============================================================================
// KPI / Links / Activity
// ============================================================================

export type DiscoveryKpi = typeof discoveryKpis.$inferSelect;
export type DiscoveryLink = typeof discoveryLinks.$inferSelect;

export interface KpiWithMeasurements {
  kpi: DiscoveryKpi;
  measurements: Array<{ id: string; value: number; measuredAt: string }>;
}

export interface LinkWithDirection extends DiscoveryLink {
  direction: "from" | "to";
}

export interface DiscoveryLinksResult {
  allLinks: LinkWithDirection[];
  linkedDiscoveries: Discovery[];
}

export interface ActivityLogWithActor {
  id: string;
  eventType: string;
  actorId: string;
  actorName: string;
  metadata: Record<string, unknown> | null;
  timestamp: string;
}

// ============================================================================
// Weekly Review / Recall Queue
// ============================================================================

export interface WeeklyReviewItem extends Discovery {
  ownerName: string | undefined;
  ageInDays: number;
  daysUntilDue: number | null;
  isOverdue: boolean;
}

export interface RecallQueueItem extends Discovery {
  ownerName: string | undefined;
  daysSinceRevisit: number;
}

// ============================================================================
// Export
// ============================================================================

export interface DiscoveryExportRow {
  id: string;
  title: string;
  status: string;
  sourceType: string;
  ownerName: string;
  ownerEmail: string;
  reviewerName: string;
  experimentCount: number;
  evidenceCount: number;
  strongEvidenceCount: number;
  createdAt: string;
  dueDate: string;
  decidedAt: string;
  decisionState: string;
  notNowTriggerType: string;
  revisitDate: string;
  deadEndFailurePattern: string;
  seedSummary: string | null;
  decisionRationale: string;
  expSlots: Array<{
    hypothesis: string;
    action: string;
    deadline: string;
    result: string;
    completedAt: string;
  }>;
  evidenceSummary: string;
}
