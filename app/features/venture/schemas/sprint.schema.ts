/**
 * Venture Sprint Zod 스키마
 */

import { z } from "zod";
import { VD_SPRINT_STATUSES } from "../constants/sprint-status";

// ============================================================================
// BASE SCHEMAS
// ============================================================================

export const vdSprintStatusSchema = z.enum(VD_SPRINT_STATUSES);

export const vdSprintConfigSchema = z
  .object({
    maxOpportunities: z.number().int().positive().optional(),
    shortlistSize: z.number().int().min(3).max(10).optional(),
    finalSize: z.number().int().min(1).max(5).optional(),
    autoCollectSignals: z.boolean().optional(),
  })
  .optional();

// ============================================================================
// CREATE SPRINT
// ============================================================================

export const createSprintSchema = z.object({
  name: z
    .string()
    .min(1, "스프린트 이름은 필수입니다")
    .max(100, "스프린트 이름은 100자 이하여야 합니다"),
  description: z.string().max(1000).optional(),
  targetEndDate: z.coerce.date().optional(),
  config: vdSprintConfigSchema,
});

export type CreateSprintInput = z.infer<typeof createSprintSchema>;

// ============================================================================
// UPDATE SPRINT
// ============================================================================

export const updateSprintSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
  targetEndDate: z.coerce.date().optional(),
  config: vdSprintConfigSchema,
  currentDay: z.number().int().min(0).max(5).optional(),
});

export type UpdateSprintInput = z.infer<typeof updateSprintSchema>;

// ============================================================================
// TRANSITION STATUS
// ============================================================================

export const transitionSprintStatusSchema = z.object({
  targetStatus: vdSprintStatusSchema,
});

export type TransitionSprintStatusInput = z.infer<typeof transitionSprintStatusSchema>;

// ============================================================================
// SPRINT SCOPE
// ============================================================================

export const createSprintScopeSchema = z.object({
  industry: z.string().min(1, "산업은 필수입니다").max(100),
  function: z.string().max(100).optional(),
  technology: z.string().max(100).optional(),
  geography: z.string().max(100).optional(),
  keywords: z.array(z.string().max(50)).max(20).optional(),
  exclusions: z.array(z.string().max(50)).max(20).optional(),
  selected: z.boolean().default(false),
});

export type CreateSprintScopeInput = z.infer<typeof createSprintScopeSchema>;

export const updateSprintScopeSchema = createSprintScopeSchema.partial();

export type UpdateSprintScopeInput = z.infer<typeof updateSprintScopeSchema>;

// ============================================================================
// SPRINT FILTER
// ============================================================================

export const sprintFilterSchema = z.object({
  status: z.array(vdSprintStatusSchema).optional(),
  ownerId: z.string().optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
});

export type SprintFilterInput = z.infer<typeof sprintFilterSchema>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * 스프린트 시작 전 검증
 * - 최소 1개 scope 선택 필수
 */
export function validateSprintStart(scopes: Array<{ selected: boolean }>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const selectedScopes = scopes.filter((s) => s.selected);

  if (selectedScopes.length === 0) {
    errors.push("최소 1개 산업/범위를 선택해야 합니다");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Gate1 진입 전 검증
 * - 최소 N개 opportunity 필요
 */
export function validateGate1Entry(
  opportunityCount: number,
  minRequired: number = 6
): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (opportunityCount < minRequired) {
    errors.push(`Gate 1 진입을 위해 최소 ${minRequired}개 기회가 필요합니다 (현재: ${opportunityCount}개)`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Gate2 진입 전 검증
 * - Shortlist 선정 완료 필요
 */
export function validateGate2Entry(shortlistCount: number): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (shortlistCount === 0) {
    errors.push("Gate 2 진입을 위해 Shortlist가 선정되어야 합니다");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
