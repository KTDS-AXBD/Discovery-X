import type { DB } from "~/db";
import type { VdSprint } from "~/features/venture/db/schema";
import {
  listSprints,
  getSprintById,
  getSprintFull,
  createSprint,
  updateSprint,
  updateSprintStatus,
  deleteSprint,
} from "~/features/venture/repositories/sprint.repository";
import type { VdSprintStatusType, VdSprintFull } from "~/features/venture/types";
import type {
  CreateSprintInput,
  UpdateSprintInput,
  SprintFilterInput,
} from "~/features/venture/schemas/sprint.schema";

// ============================================================================
// Service
// ============================================================================

/**
 * Venture Sprint 서비스
 * 이미 잘 분리된 sprint.repository.ts를 위임하는 얇은 래퍼.
 * 향후 비즈니스 규칙 (Gate 통과 조건 등) 추가 시 여기서 처리.
 */
export class VentureService {
  constructor(private db: DB) {}

  /**
   * 스프린트 목록 조회
   * routes/venture.overview.tsx loader 패턴 추출
   */
  async listSprints(filter?: SprintFilterInput): Promise<VdSprint[]> {
    return listSprints(this.db, filter);
  }

  /**
   * 스프린트 상세 조회
   */
  async getSprintById(id: string): Promise<VdSprint | null> {
    return getSprintById(this.db, id);
  }

  /**
   * 스프린트 전체 조회 (scopes 포함)
   */
  async getSprintFull(id: string): Promise<VdSprintFull | null> {
    return getSprintFull(this.db, id);
  }

  /**
   * 스프린트 생성
   */
  async createSprint(
    input: CreateSprintInput & { ownerId: string; tenantId?: string },
  ): Promise<VdSprint> {
    return createSprint(this.db, input);
  }

  /**
   * 스프린트 업데이트
   */
  async updateSprint(
    sprintId: string,
    input: UpdateSprintInput,
  ): Promise<VdSprint | null> {
    return updateSprint(this.db, sprintId, input);
  }

  /**
   * 스프린트 상태 변경
   */
  async updateSprintStatus(
    sprintId: string,
    status: VdSprintStatusType,
    additionalUpdates?: Partial<VdSprint>,
  ): Promise<VdSprint | null> {
    return updateSprintStatus(this.db, sprintId, status, additionalUpdates);
  }

  /**
   * 스프린트 삭제
   */
  async deleteSprint(sprintId: string): Promise<void> {
    return deleteSprint(this.db, sprintId);
  }
}
