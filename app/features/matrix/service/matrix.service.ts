import { eq, and, desc, sql } from "drizzle-orm";
import type { DB } from "~/db";
import {
  industries,
  functions,
  matrixCells,
  cellTopicMap,
  consensusScores,
} from "~/features/matrix/db/schema";
import type {
  Industry,
  Function,
  MatrixCell,
  CellTopicLink,
} from "~/features/matrix/db/schema";
import { topics } from "~/db";
import type { HeatmapData, HeatmapCell } from "~/features/matrix/types";

// ============================================================================
// Types
// ============================================================================

interface CreateIndustryInput {
  id: string;
  name: string;
  nameEn?: string;
  description?: string;
  displayOrder?: number;
  strategicWeight?: number;
  icon?: string;
}

interface UpdateIndustryInput {
  name?: string;
  nameEn?: string;
  description?: string;
  displayOrder?: number;
  strategicWeight?: number;
  icon?: string;
  isActive?: number;
}

interface CreateFunctionInput {
  id: string;
  name: string;
  nameEn?: string;
  description?: string;
  category: string;
  displayOrder?: number;
}

interface UpdateFunctionInput {
  name?: string;
  nameEn?: string;
  description?: string;
  category?: string;
  displayOrder?: number;
  isActive?: number;
}

interface CellFilters {
  industryId?: string;
  functionId?: string;
  status?: string;
  timeHorizon?: string;
  pipelineStage?: string;
}

interface CreateCellInput {
  teamId: string;
  industryId: string;
  functionId: string;
  timeHorizon?: string;
  status?: string;
  description?: string;
  createdBy: string;
}

interface UpdateCellInput {
  timeHorizon?: string;
  pipelineStage?: string;
  status?: string;
  description?: string;
  revenuePotential?: number;
  revenueUnit?: string;
  ownerId?: string;
  priority?: number;
  tags?: string;
}

// ============================================================================
// Service
// ============================================================================

export class MatrixService {
  constructor(private db: DB) {}

  // --------------------------------------------------------------------------
  // Industry CRUD
  // --------------------------------------------------------------------------

  async getIndustries(teamId: string): Promise<Industry[]> {
    return this.db
      .select()
      .from(industries)
      .where(and(eq(industries.teamId, teamId), eq(industries.isActive, 1)))
      .orderBy(industries.displayOrder);
  }

  async createIndustry(
    teamId: string,
    data: CreateIndustryInput,
  ): Promise<Industry | null> {
    await this.db.insert(industries).values({
      id: data.id,
      teamId,
      name: data.name,
      nameEn: data.nameEn,
      description: data.description,
      displayOrder: data.displayOrder ?? 0,
      strategicWeight: data.strategicWeight ?? 1.0,
      icon: data.icon,
    });
    const row = await this.db
      .select()
      .from(industries)
      .where(eq(industries.id, data.id))
      .get();
    return row ?? null;
  }

  async updateIndustry(
    id: string,
    data: UpdateIndustryInput,
  ): Promise<Industry | null> {
    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.nameEn !== undefined) updates.nameEn = data.nameEn;
    if (data.description !== undefined) updates.description = data.description;
    if (data.displayOrder !== undefined) updates.displayOrder = data.displayOrder;
    if (data.strategicWeight !== undefined) updates.strategicWeight = data.strategicWeight;
    if (data.icon !== undefined) updates.icon = data.icon;
    if (data.isActive !== undefined) updates.isActive = data.isActive;

    if (Object.keys(updates).length === 0) return null;

    updates.updatedAt = sql`(unixepoch())`;
    await this.db.update(industries).set(updates).where(eq(industries.id, id));
    const row = await this.db
      .select()
      .from(industries)
      .where(eq(industries.id, id))
      .get();
    return row ?? null;
  }

  // --------------------------------------------------------------------------
  // Function CRUD
  // --------------------------------------------------------------------------

  async getFunctions(teamId: string): Promise<Function[]> {
    return this.db
      .select()
      .from(functions)
      .where(and(eq(functions.teamId, teamId), eq(functions.isActive, 1)))
      .orderBy(functions.displayOrder);
  }

  async createFunction(
    teamId: string,
    data: CreateFunctionInput,
  ): Promise<Function | null> {
    await this.db.insert(functions).values({
      id: data.id,
      teamId,
      name: data.name,
      nameEn: data.nameEn,
      description: data.description,
      category: data.category,
      displayOrder: data.displayOrder ?? 0,
    });
    const row = await this.db
      .select()
      .from(functions)
      .where(eq(functions.id, data.id))
      .get();
    return row ?? null;
  }

  async updateFunction(
    id: string,
    data: UpdateFunctionInput,
  ): Promise<Function | null> {
    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.nameEn !== undefined) updates.nameEn = data.nameEn;
    if (data.description !== undefined) updates.description = data.description;
    if (data.category !== undefined) updates.category = data.category;
    if (data.displayOrder !== undefined) updates.displayOrder = data.displayOrder;
    if (data.isActive !== undefined) updates.isActive = data.isActive;

    if (Object.keys(updates).length === 0) return null;

    updates.updatedAt = sql`(unixepoch())`;
    await this.db.update(functions).set(updates).where(eq(functions.id, id));
    const row = await this.db
      .select()
      .from(functions)
      .where(eq(functions.id, id))
      .get();
    return row ?? null;
  }

  // --------------------------------------------------------------------------
  // Cell CRUD
  // --------------------------------------------------------------------------

  async getCells(teamId: string, filters?: CellFilters): Promise<MatrixCell[]> {
    const conditions = [eq(matrixCells.teamId, teamId)];

    if (filters?.industryId) {
      conditions.push(eq(matrixCells.industryId, filters.industryId));
    }
    if (filters?.functionId) {
      conditions.push(eq(matrixCells.functionId, filters.functionId));
    }
    if (filters?.status) {
      conditions.push(eq(matrixCells.status, filters.status));
    }
    if (filters?.timeHorizon) {
      conditions.push(eq(matrixCells.timeHorizon, filters.timeHorizon));
    }
    if (filters?.pipelineStage) {
      conditions.push(eq(matrixCells.pipelineStage, filters.pipelineStage));
    }

    return this.db
      .select()
      .from(matrixCells)
      .where(and(...conditions))
      .orderBy(desc(matrixCells.updatedAt));
  }

  async getCell(cellId: string): Promise<
    (MatrixCell & { industryName: string; functionName: string }) | null
  > {
    const row = await this.db
      .select({
        id: matrixCells.id,
        teamId: matrixCells.teamId,
        industryId: matrixCells.industryId,
        functionId: matrixCells.functionId,
        timeHorizon: matrixCells.timeHorizon,
        pipelineStage: matrixCells.pipelineStage,
        status: matrixCells.status,
        description: matrixCells.description,
        revenuePotential: matrixCells.revenuePotential,
        revenueUnit: matrixCells.revenueUnit,
        ownerId: matrixCells.ownerId,
        priority: matrixCells.priority,
        tags: matrixCells.tags,
        createdBy: matrixCells.createdBy,
        createdAt: matrixCells.createdAt,
        updatedAt: matrixCells.updatedAt,
        industryName: industries.name,
        functionName: functions.name,
      })
      .from(matrixCells)
      .innerJoin(industries, eq(matrixCells.industryId, industries.id))
      .innerJoin(functions, eq(matrixCells.functionId, functions.id))
      .where(eq(matrixCells.id, cellId))
      .get();

    return row ?? null;
  }

  async createCell(data: CreateCellInput): Promise<MatrixCell | null> {
    const cellId = `${data.industryId}_${data.functionId}`;
    await this.db.insert(matrixCells).values({
      id: cellId,
      teamId: data.teamId,
      industryId: data.industryId,
      functionId: data.functionId,
      timeHorizon: data.timeHorizon ?? "short",
      status: data.status ?? "active",
      description: data.description,
      createdBy: data.createdBy,
    });
    const row = await this.db
      .select()
      .from(matrixCells)
      .where(eq(matrixCells.id, cellId))
      .get();
    return row ?? null;
  }

  async updateCell(
    cellId: string,
    data: UpdateCellInput,
  ): Promise<MatrixCell | null> {
    const updates: Record<string, unknown> = {};
    if (data.timeHorizon !== undefined) updates.timeHorizon = data.timeHorizon;
    if (data.pipelineStage !== undefined) updates.pipelineStage = data.pipelineStage;
    if (data.status !== undefined) updates.status = data.status;
    if (data.description !== undefined) updates.description = data.description;
    if (data.revenuePotential !== undefined) updates.revenuePotential = data.revenuePotential;
    if (data.revenueUnit !== undefined) updates.revenueUnit = data.revenueUnit;
    if (data.ownerId !== undefined) updates.ownerId = data.ownerId;
    if (data.priority !== undefined) updates.priority = data.priority;
    if (data.tags !== undefined) updates.tags = data.tags;

    if (Object.keys(updates).length === 0) return null;

    updates.updatedAt = sql`(unixepoch())`;
    await this.db.update(matrixCells).set(updates).where(eq(matrixCells.id, cellId));
    const row = await this.db
      .select()
      .from(matrixCells)
      .where(eq(matrixCells.id, cellId))
      .get();
    return row ?? null;
  }

  // --------------------------------------------------------------------------
  // Cell-Topic 연결
  // --------------------------------------------------------------------------

  async linkCellToTopic(
    cellId: string,
    topicId: string,
    linkedBy: string,
    relevance?: number,
    note?: string,
  ): Promise<CellTopicLink | null> {
    await this.db.insert(cellTopicMap).values({
      cellId,
      topicId,
      linkedBy,
      relevance: relevance ?? 1.0,
      note,
    });
    const row = await this.db
      .select()
      .from(cellTopicMap)
      .where(and(eq(cellTopicMap.cellId, cellId), eq(cellTopicMap.topicId, topicId)))
      .get();
    return row ?? null;
  }

  async unlinkCellFromTopic(cellId: string, topicId: string): Promise<void> {
    await this.db
      .delete(cellTopicMap)
      .where(and(eq(cellTopicMap.cellId, cellId), eq(cellTopicMap.topicId, topicId)));
  }

  async getCellTopics(cellId: string): Promise<
    Array<{ topicId: string; topicName: string; relevance: number; note: string | null }>
  > {
    const rows = await this.db
      .select({
        topicId: cellTopicMap.topicId,
        topicName: topics.name,
        relevance: cellTopicMap.relevance,
        note: cellTopicMap.note,
      })
      .from(cellTopicMap)
      .innerJoin(topics, eq(cellTopicMap.topicId, topics.id))
      .where(eq(cellTopicMap.cellId, cellId));
    return rows;
  }

  async getTopicCells(topicId: string): Promise<
    Array<{ cellId: string; industryName: string; functionName: string; relevance: number }>
  > {
    const rows = await this.db
      .select({
        cellId: cellTopicMap.cellId,
        industryName: industries.name,
        functionName: functions.name,
        relevance: cellTopicMap.relevance,
      })
      .from(cellTopicMap)
      .innerJoin(matrixCells, eq(cellTopicMap.cellId, matrixCells.id))
      .innerJoin(industries, eq(matrixCells.industryId, industries.id))
      .innerJoin(functions, eq(matrixCells.functionId, functions.id))
      .where(eq(cellTopicMap.topicId, topicId));
    return rows;
  }

  // --------------------------------------------------------------------------
  // Heatmap
  // --------------------------------------------------------------------------

  async getHeatmapData(teamId: string, period?: string): Promise<HeatmapData> {
    const currentPeriod = period ?? getCurrentPeriod();

    const activeIndustries = await this.db
      .select({
        id: industries.id,
        name: industries.name,
        nameEn: industries.nameEn,
        order: industries.displayOrder,
      })
      .from(industries)
      .where(and(eq(industries.teamId, teamId), eq(industries.isActive, 1)))
      .orderBy(industries.displayOrder);

    const activeFunctions = await this.db
      .select({
        id: functions.id,
        name: functions.name,
        nameEn: functions.nameEn,
        category: functions.category,
        order: functions.displayOrder,
      })
      .from(functions)
      .where(and(eq(functions.teamId, teamId), eq(functions.isActive, 1)))
      .orderBy(functions.displayOrder);

    // 모든 cell + consensus score를 LEFT JOIN으로 조회
    const cellRows = await this.db
      .select({
        cellId: matrixCells.id,
        industryId: matrixCells.industryId,
        functionId: matrixCells.functionId,
        pipelineStage: matrixCells.pipelineStage,
        cellStatus: matrixCells.status,
        compositeScore: consensusScores.compositeScore,
        scoreStatus: consensusScores.status,
        prevComposite: consensusScores.prevComposite,
      })
      .from(matrixCells)
      .leftJoin(
        consensusScores,
        and(
          eq(matrixCells.id, consensusScores.cellId),
          eq(consensusScores.scorePeriod, currentPeriod),
        ),
      )
      .where(eq(matrixCells.teamId, teamId));

    // industry/function 이름/순서 lookup 맵
    const indMap = new Map(activeIndustries.map((i) => [i.id, i]));
    const fnMap = new Map(activeFunctions.map((f) => [f.id, f]));

    const cells: HeatmapCell[] = cellRows.map((row) => {
      const ind = indMap.get(row.industryId);
      const fn = fnMap.get(row.functionId);
      return {
        cellId: row.cellId,
        industryId: row.industryId,
        industryName: ind?.name ?? row.industryId,
        industryOrder: ind?.order ?? 999,
        functionId: row.functionId,
        functionName: fn?.name ?? row.functionId,
        functionOrder: fn?.order ?? 999,
        compositeScore: row.compositeScore,
        scoreStatus: row.scoreStatus,
        pipelineStage: row.pipelineStage,
        cellStatus: row.cellStatus,
        delta:
          row.compositeScore !== null && row.prevComposite !== null
            ? row.compositeScore - row.prevComposite
            : null,
      };
    });

    return {
      industries: activeIndustries,
      functions: activeFunctions,
      cells,
      period: currentPeriod,
    };
  }
}

// ============================================================================
// Helpers
// ============================================================================

function getCurrentPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
