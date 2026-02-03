/**
 * Venture Opportunity Zod 스키마
 */

import { z } from "zod";

// ============================================================================
// SIGNAL
// ============================================================================

export const vdSignalTypeSchema = z.enum([
  "TREND",
  "NEWS",
  "RESEARCH",
  "COMPETITOR",
  "INTERNAL",
  "USER_FEEDBACK",
]);

export const createSignalSchema = z.object({
  signalType: vdSignalTypeSchema,
  title: z.string().min(1, "제목은 필수입니다").max(200),
  summary: z.string().max(2000).optional(),
  sourceUrl: z.string().url("유효한 URL을 입력하세요").optional().or(z.literal("")),
  sourceTitle: z.string().max(200).optional(),
  publishedAt: z.coerce.date().optional(),
  relevanceScore: z.number().int().min(0).max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateSignalInput = z.infer<typeof createSignalSchema>;

// ============================================================================
// PROBLEM
// ============================================================================

export const createProblemSchema = z.object({
  statement: z.string().min(1, "문제 정의는 필수입니다").max(1000),
  severity: z.number().int().min(1).max(5).optional(),
  frequency: z.number().int().min(1).max(5).optional(),
  targetSegment: z.string().max(200).optional(),
  signalIds: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateProblemInput = z.infer<typeof createProblemSchema>;

// ============================================================================
// THEME
// ============================================================================

export const createThemeSchema = z.object({
  name: z.string().min(1, "테마 이름은 필수입니다").max(100),
  description: z.string().max(1000).optional(),
  parentThemeId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateThemeInput = z.infer<typeof createThemeSchema>;

// ============================================================================
// OPPORTUNITY
// ============================================================================

export const vdRecommendationSchema = z.enum(["INVEST", "EXPLORE", "HOLD", "DROP"]);

export const createOpportunitySchema = z.object({
  title: z.string().min(1, "기회 제목은 필수입니다").max(200),
  description: z.string().max(3000).optional(),
  themeId: z.string().optional(),
  problemIds: z.array(z.string()).optional(),
  targetSegment: z.string().max(200).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;

export const updateOpportunitySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(3000).optional(),
  themeId: z.string().nullable().optional(),
  problemIds: z.array(z.string()).optional(),
  targetSegment: z.string().max(200).optional(),
  potentialScore: z.number().int().min(0).max(100).optional(),
  confidenceScore: z.number().int().min(0).max(100).optional(),
  depthScore: z.number().int().min(0).max(100).optional(),
  effortScore: z.number().int().min(0).max(100).optional(),
  recommendation: vdRecommendationSchema.optional(),
  isShortlisted: z.boolean().optional(),
  isFinal: z.boolean().optional(),
  rank: z.number().int().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;

// ============================================================================
// EVIDENCE
// ============================================================================

export const vdEvidenceTypeSchema = z.enum([
  "DATA",
  "USER_QUOTE",
  "ARTIFACT",
  "RESEARCH",
  "ASSUMPTION",
]);

export const vdEvidenceStrengthSchema = z.enum(["A", "B", "C", "D"]);

export const createEvidenceSchema = z.object({
  opportunityId: z.string().optional(),
  signalId: z.string().optional(),
  type: vdEvidenceTypeSchema,
  strength: vdEvidenceStrengthSchema,
  content: z.string().min(1, "근거 내용은 필수입니다").max(3000),
  sourceUrl: z.string().url("유효한 URL을 입력하세요").optional().or(z.literal("")),
  sourceTitle: z.string().max(200).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateEvidenceInput = z.infer<typeof createEvidenceSchema>;

// ============================================================================
// ASSUMPTION
// ============================================================================

export const vdAssumptionStatusSchema = z.enum(["OPEN", "VALIDATED", "INVALIDATED"]);

export const createAssumptionSchema = z.object({
  statement: z.string().min(1, "가정 내용은 필수입니다").max(1000),
  criticality: z.number().int().min(1).max(5).optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  validationMethod: z.string().max(500).optional(),
  evidenceIds: z.array(z.string()).optional(),
});

export type CreateAssumptionInput = z.infer<typeof createAssumptionSchema>;

export const updateAssumptionSchema = createAssumptionSchema.partial().extend({
  status: vdAssumptionStatusSchema.optional(),
});

export type UpdateAssumptionInput = z.infer<typeof updateAssumptionSchema>;

// ============================================================================
// PREMORTEM
// ============================================================================

export const createPremortemSchema = z.object({
  failureScenario: z.string().min(1, "실패 시나리오는 필수입니다").max(1000),
  probability: z.number().int().min(0).max(100).optional(),
  impact: z.number().int().min(1).max(5).optional(),
  mitigationStrategy: z.string().max(1000).optional(),
});

export type CreatePremortemInput = z.infer<typeof createPremortemSchema>;

export const updatePremortemSchema = createPremortemSchema.partial();

export type UpdatePremortemInput = z.infer<typeof updatePremortemSchema>;

// ============================================================================
// ARTIFACT
// ============================================================================

export const vdArtifactTypeSchema = z.enum([
  "LEAN_CANVAS",
  "PITCH_DECK",
  "ONE_PAGER",
  "EXECUTIVE_SUMMARY",
  "CUSTOM",
]);

export const createArtifactSchema = z.object({
  artifactType: vdArtifactTypeSchema,
  title: z.string().min(1, "제목은 필수입니다").max(200),
  content: z.record(z.unknown()).optional(),
});

export type CreateArtifactInput = z.infer<typeof createArtifactSchema>;

export const updateArtifactSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.record(z.unknown()).optional(),
});

export type UpdateArtifactInput = z.infer<typeof updateArtifactSchema>;

// ============================================================================
// SCORE
// ============================================================================

export const vdScoreDimensionSchema = z.enum(["potential", "confidence", "depth", "effort"]);
export const vdScoreSourceSchema = z.enum(["agent", "human", "aggregated"]);

export const createScoreSchema = z.object({
  dimension: vdScoreDimensionSchema,
  value: z.number().int().min(0).max(100),
  source: vdScoreSourceSchema,
  metadata: z.record(z.unknown()).optional(),
});

export type CreateScoreInput = z.infer<typeof createScoreSchema>;
