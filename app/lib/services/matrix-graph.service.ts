/**
 * MatrixGraphService — Framework Matrix 데이터를 JSON-LD Graph로 변환/동기화.
 * MatrixService에서 조회한 Cell/Industry/Function을 JSON-LD 노드로 변환하고
 * GraphStore에 저장하는 브릿지 서비스.
 */
import { eq, and, desc } from "drizzle-orm";

import type { DB } from "~/db";
import {
  industries,
  functions,
  matrixCells,
  cellTopicMap,
  consensusScores,
  type Industry,
  type MatrixCell,
} from "~/features/matrix/db/schema";
import type { ConsensusScore } from "~/features/matrix/db/schema";
import { topics } from "~/db/schema-v2";
import type { JsonLdNode, JsonLdGraph, GraphRecord } from "~/lib/graph/types";
import { GraphStore } from "~/lib/graph/store";
import { MATRIX_CONTEXT } from "~/lib/graph/matrix-context";

// Function 타입은 예약어와 충돌하므로 별칭 사용
import type { Function as MatrixFunction } from "~/features/matrix/db/schema";

// ─── 현재 기간 헬퍼 ───────────────────────────────────────────────

function getCurrentPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

// ─── 서비스 ───────────────────────────────────────────────────────

export class MatrixGraphService {
  private graphStore: GraphStore;

  constructor(private db: DB) {
    this.graphStore = new GraphStore(db);
  }

  // ──────────────────────────────────────────────────────────────
  // 1. Cell → JsonLdNode
  // ──────────────────────────────────────────────────────────────

  /** MatrixCell을 JSON-LD 노드로 변환 */
  cellToJsonLdNode(
    cell: MatrixCell,
    industryName: string,
    functionName: string,
  ): JsonLdNode {
    const node: JsonLdNode = {
      "@id": `mx:cell/${cell.id}`,
      "@type": "mx:Cell",
      name: `${industryName} × ${functionName}`,
      industryId: `mx:industry/${cell.industryId}`,
      functionId: `mx:function/${cell.functionId}`,
      timeHorizon: cell.timeHorizon,
      pipelineStage: cell.pipelineStage,
      status: cell.status,
      relatedTo: [
        `mx:industry/${cell.industryId}`,
        `mx:function/${cell.functionId}`,
        `mx:horizon/${cell.timeHorizon}`,
      ],
      createdAt: cell.createdAt.toISOString(),
    };

    if (cell.description) node.description = cell.description;
    if (cell.priority !== null) node.priority = cell.priority;

    return node;
  }

  // ──────────────────────────────────────────────────────────────
  // 2. Industry → JsonLdNode
  // ──────────────────────────────────────────────────────────────

  /** Industry를 JSON-LD 노드로 변환 */
  industryToJsonLdNode(industry: Industry): JsonLdNode {
    const node: JsonLdNode = {
      "@id": `mx:industry/${industry.id}`,
      "@type": "mx:Industry",
      name: industry.name,
      strategicWeight: industry.strategicWeight,
      createdAt: industry.createdAt.toISOString(),
    };

    if (industry.nameEn) node.nameEn = industry.nameEn;
    if (industry.description) node.description = industry.description;

    return node;
  }

  // ──────────────────────────────────────────────────────────────
  // 3. Function → JsonLdNode
  // ──────────────────────────────────────────────────────────────

  /** Function을 JSON-LD 노드로 변환 */
  functionToJsonLdNode(func: MatrixFunction): JsonLdNode {
    const node: JsonLdNode = {
      "@id": `mx:function/${func.id}`,
      "@type": "mx:Function",
      name: func.name,
      category: func.category,
      createdAt: func.createdAt.toISOString(),
    };

    if (func.nameEn) node.nameEn = func.nameEn;
    if (func.description) node.description = func.description;

    return node;
  }

  // ──────────────────────────────────────────────────────────────
  // 4. buildTeamMatrixGraph — 팀 전체 Matrix → JSON-LD Graph
  // ──────────────────────────────────────────────────────────────

  /** 팀의 전체 Matrix 데이터를 JSON-LD Graph로 빌드 (upsert) */
  async buildTeamMatrixGraph(teamId: string): Promise<GraphRecord> {
    // 1) Industry 조회
    const industryRows = await this.db
      .select()
      .from(industries)
      .where(and(eq(industries.teamId, teamId), eq(industries.isActive, 1)))
      .orderBy(industries.displayOrder);

    // 2) Function 조회
    const functionRows = await this.db
      .select()
      .from(functions)
      .where(and(eq(functions.teamId, teamId), eq(functions.isActive, 1)))
      .orderBy(functions.displayOrder);

    // 3) Cell 조회
    const cellRows = await this.db
      .select()
      .from(matrixCells)
      .where(eq(matrixCells.teamId, teamId));

    // 4) 최신 consensus score 조회
    const currentPeriod = getCurrentPeriod();
    const scoreRows = await this.db
      .select()
      .from(consensusScores)
      .where(eq(consensusScores.scorePeriod, currentPeriod));

    const scoreMap = new Map<string, ConsensusScore>(
      scoreRows.map((s) => [s.cellId, s]),
    );

    // 5) Cell-Topic 링크 조회
    const topicLinks = await this.db
      .select({
        cellId: cellTopicMap.cellId,
        topicId: cellTopicMap.topicId,
        topicName: topics.name,
        relevance: cellTopicMap.relevance,
      })
      .from(cellTopicMap)
      .innerJoin(topics, eq(cellTopicMap.topicId, topics.id));

    const topicLinkMap = new Map<
      string,
      Array<{ topicId: string; topicName: string; relevance: number }>
    >();
    for (const link of topicLinks) {
      const existing = topicLinkMap.get(link.cellId) ?? [];
      existing.push({
        topicId: link.topicId,
        topicName: link.topicName,
        relevance: link.relevance,
      });
      topicLinkMap.set(link.cellId, existing);
    }

    // 6) Industry/Function 이름 lookup
    const industryMap = new Map(industryRows.map((i) => [i.id, i]));
    const functionMap = new Map(functionRows.map((f) => [f.id, f]));

    // 7) 노드 빌드
    const nodes: JsonLdNode[] = [];

    // Industry 노드
    for (const ind of industryRows) {
      nodes.push(this.industryToJsonLdNode(ind));
    }

    // Function 노드
    for (const fn of functionRows) {
      nodes.push(this.functionToJsonLdNode(fn));
    }

    // TimeHorizon 노드 (고정 3개)
    const horizons: Array<{
      id: string;
      name: string;
      nameEn: string;
      rangeMonths: number;
    }> = [
      { id: "short", name: "단기", nameEn: "Short-term", rangeMonths: 3 },
      { id: "mid", name: "중기", nameEn: "Mid-term", rangeMonths: 24 },
      { id: "long", name: "장기", nameEn: "Long-term", rangeMonths: 36 },
    ];

    for (const h of horizons) {
      nodes.push({
        "@id": `mx:horizon/${h.id}`,
        "@type": "mx:TimeHorizon",
        name: h.name,
        nameEn: h.nameEn,
        rangeMonths: h.rangeMonths,
      });
    }

    // Cell 노드 + Score 노드
    for (const cell of cellRows) {
      const indName = industryMap.get(cell.industryId)?.name ?? cell.industryId;
      const fnName =
        functionMap.get(cell.functionId)?.name ?? cell.functionId;

      const cellNode = this.cellToJsonLdNode(cell, indName, fnName);

      // Topic 링크 추가
      const linkedTopics = topicLinkMap.get(cell.id);
      if (linkedTopics && linkedTopics.length > 0) {
        cellNode.linkedTopic = linkedTopics.map(
          (t) => `dx:topic/${t.topicId}`,
        );
      }

      // Score가 있으면 Cell 노드에 score 참조 + Score 노드 추가
      const score = scoreMap.get(cell.id);
      if (score) {
        const scoreNodeId = `mx:score/${cell.id}/${score.scorePeriod}`;
        cellNode.compositeScore = score.compositeScore;
        cellNode.relatedTo = [
          ...(cellNode.relatedTo as string[]),
          scoreNodeId,
        ];

        nodes.push({
          "@id": scoreNodeId,
          "@type": "mx:Score",
          name: `${indName} × ${fnName} 스코어 (${score.scorePeriod})`,
          compositeScore: score.compositeScore,
          clevelScore: score.clevelScore,
          executionScore: score.executionScore,
          status: score.status,
          relatedTo: `mx:cell/${cell.id}`,
          createdAt: score.createdAt.toISOString(),
        });
      }

      nodes.push(cellNode);
    }

    // 8) JsonLdGraph 생성
    const jsonld: JsonLdGraph = {
      "@context": { ...MATRIX_CONTEXT },
      "@graph": nodes,
    };

    // 9) 기존 Graph가 있으면 update, 없으면 create
    const existing = await this.graphStore.getByScopeId("org", teamId);

    if (existing) {
      // 기존 Graph의 노드 중 mx: 접두사가 아닌 것은 보존
      const nonMatrixNodes = existing.jsonld["@graph"].filter(
        (n) => !n["@id"].startsWith("mx:"),
      );

      const mergedJsonld: JsonLdGraph = {
        "@context": {
          ...existing.jsonld["@context"],
          ...MATRIX_CONTEXT,
        },
        "@graph": [...nonMatrixNodes, ...nodes],
      };

      return this.graphStore.update(existing.id, mergedJsonld, "Matrix Graph 전체 재빌드");
    }

    return this.graphStore.create({
      scopeType: "org",
      scopeId: teamId,
      jsonld,
      contentHash: "", // GraphStore.create가 내부에서 재계산
    });
  }

  // ──────────────────────────────────────────────────────────────
  // 5. syncCellToGraph — 단일 Cell 변경 시 Graph 동기화 (upsert)
  // ──────────────────────────────────────────────────────────────

  /** 단일 Cell의 변경사항을 기존 Graph에 upsert */
  async syncCellToGraph(cellId: string): Promise<GraphRecord> {
    // Cell + Industry/Function 이름 조회
    const cellRow = await this.db
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

    if (!cellRow) {
      throw new Error(`Cell not found: ${cellId}`);
    }

    const cellNode = this.cellToJsonLdNode(
      cellRow as MatrixCell,
      cellRow.industryName,
      cellRow.functionName,
    );

    // Topic 링크 추가
    const linkedTopics = await this.db
      .select({
        topicId: cellTopicMap.topicId,
        topicName: topics.name,
      })
      .from(cellTopicMap)
      .innerJoin(topics, eq(cellTopicMap.topicId, topics.id))
      .where(eq(cellTopicMap.cellId, cellId));

    if (linkedTopics.length > 0) {
      cellNode.linkedTopic = linkedTopics.map(
        (t) => `dx:topic/${t.topicId}`,
      );
    }

    // 최신 consensus score 조회
    const latestScore = await this.db
      .select()
      .from(consensusScores)
      .where(eq(consensusScores.cellId, cellId))
      .orderBy(desc(consensusScores.scorePeriod))
      .limit(1)
      .get();

    const newNodes: JsonLdNode[] = [cellNode];

    if (latestScore) {
      const scoreNodeId = `mx:score/${cellId}/${latestScore.scorePeriod}`;
      cellNode.compositeScore = latestScore.compositeScore;
      cellNode.relatedTo = [
        ...(cellNode.relatedTo as string[]),
        scoreNodeId,
      ];

      newNodes.push({
        "@id": scoreNodeId,
        "@type": "mx:Score",
        name: `${cellRow.industryName} × ${cellRow.functionName} 스코어 (${latestScore.scorePeriod})`,
        compositeScore: latestScore.compositeScore,
        clevelScore: latestScore.clevelScore,
        executionScore: latestScore.executionScore,
        status: latestScore.status,
        relatedTo: `mx:cell/${cellId}`,
        createdAt: latestScore.createdAt.toISOString(),
      });
    }

    // 기존 Graph 조회 or 생성
    const existing = await this.graphStore.getByScopeId("org", cellRow.teamId);

    if (!existing) {
      // Graph가 없으면 전체 빌드
      return this.buildTeamMatrixGraph(cellRow.teamId);
    }

    // 기존 노드에서 이 Cell + Score 관련 노드 제거 후 새 노드로 교체
    const cellNodeId = `mx:cell/${cellId}`;
    const scorePrefix = `mx:score/${cellId}/`;

    const filteredNodes = existing.jsonld["@graph"].filter(
      (n) => n["@id"] !== cellNodeId && !n["@id"].startsWith(scorePrefix),
    );

    const updatedJsonld: JsonLdGraph = {
      "@context": {
        ...existing.jsonld["@context"],
        ...MATRIX_CONTEXT,
      },
      "@graph": [...filteredNodes, ...newNodes],
    };

    return this.graphStore.update(
      existing.id,
      updatedJsonld,
      `Cell ${cellId} 동기화`,
    );
  }

  // ──────────────────────────────────────────────────────────────
  // 6. getMatrixGraph — 팀의 Matrix Graph 조회
  // ──────────────────────────────────────────────────────────────

  /** 팀의 Matrix Graph 조회. 없으면 null 반환. */
  async getMatrixGraph(teamId: string): Promise<GraphRecord | null> {
    return this.graphStore.getByScopeId("org", teamId);
  }
}
