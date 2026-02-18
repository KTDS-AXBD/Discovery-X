// Graph → Markdown Projection 생성 및 동기화
import { eq, and } from "drizzle-orm";
import { graphs, projections } from "~/db/schema-v2";
import type { DB } from "~/db";
import type {
  JsonLdGraph,
  JsonLdNode,
  Projection,
  ProjectionType,
  ScopeType,
} from "./types";

// ─── 헬퍼: 노드를 @type별로 분류 ────────────────────────────────────
function groupNodesByType(
  nodes: JsonLdNode[],
): Map<string, JsonLdNode[]> {
  const map = new Map<string, JsonLdNode[]>();
  for (const node of nodes) {
    const type = node["@type"];
    const list = map.get(type) ?? [];
    list.push(node);
    map.set(type, list);
  }
  return map;
}

// ─── 헬퍼: 노드에서 문자열 속성 추출 ─────────────────────────────────
function str(node: JsonLdNode, key: string, fallback = ""): string {
  const v = node[key];
  return typeof v === "string" ? v : fallback;
}

// ─── ProjectionBuilder ───────────────────────────────────────────────
export class ProjectionBuilder {
  constructor(private readonly db: DB) {}

  /**
   * Graph 변경 시 hash 비교 → 불일치 시만 Projection 재생성.
   * @returns true면 업데이트됨, false면 이미 최신
   */
  async syncProjection(
    scopeType: ScopeType,
    scopeId: string,
  ): Promise<boolean> {
    // 1. Graph 조회
    const graph = await this.db
      .select()
      .from(graphs)
      .where(and(eq(graphs.scopeType, scopeType), eq(graphs.scopeId, scopeId)))
      .get();

    if (!graph) return false;

    const jsonld: JsonLdGraph = JSON.parse(graph.jsonld);

    // 2. scope에 적합한 projType 결정
    const projType = this.resolveProjType(scopeType);

    // 3. 기존 Projection 조회
    const existing = await this.db
      .select()
      .from(projections)
      .where(
        and(
          eq(projections.scopeType, scopeType),
          eq(projections.scopeId, scopeId),
          eq(projections.projType, projType),
        ),
      )
      .get();

    // 4. hash 비교 — 같으면 스킵
    if (existing && existing.sourceHash === graph.contentHash) {
      return false;
    }

    // 5. Markdown 생성
    const content = this.buildFromTemplate(jsonld, scopeType, projType);

    // 6. upsert
    await this.db
      .insert(projections)
      .values({
        id: crypto.randomUUID(),
        scopeType,
        scopeId,
        projType,
        content,
        sourceHash: graph.contentHash,
        graphVersion: graph.version,
      })
      .onConflictDoUpdate({
        target: [projections.scopeType, projections.scopeId, projections.projType],
        set: {
          content,
          sourceHash: graph.contentHash,
          graphVersion: graph.version,
        },
      });

    return true;
  }

  /** scope별 Projection 조회 */
  async getProjection(
    scopeType: ScopeType,
    scopeId: string,
    projType: ProjectionType,
  ): Promise<Projection | null> {
    const row = await this.db
      .select()
      .from(projections)
      .where(
        and(
          eq(projections.scopeType, scopeType),
          eq(projections.scopeId, scopeId),
          eq(projections.projType, projType),
        ),
      )
      .get();

    if (!row) return null;

    // Drizzle select 결과의 string 타입을 도메인 타입으로 단언
    return {
      ...row,
      scopeType: row.scopeType as ScopeType,
      projType: row.projType as ProjectionType,
    };
  }

  // ─── MATRIX.md Projection 동기화 (org scope 전용) ─────────────────

  /** Matrix Graph에서 MATRIX.md Projection 생성 (org scope 전용) */
  async syncMatrixProjection(teamId: string): Promise<boolean> {
    // 1. Graph 조회
    const graph = await this.db
      .select()
      .from(graphs)
      .where(and(eq(graphs.scopeType, "org"), eq(graphs.scopeId, teamId)))
      .get();

    if (!graph) return false;

    const jsonld: JsonLdGraph = JSON.parse(graph.jsonld);
    const projType: ProjectionType = "MATRIX.md";

    // 2. 기존 Projection 조회
    const existing = await this.db
      .select()
      .from(projections)
      .where(
        and(
          eq(projections.scopeType, "org"),
          eq(projections.scopeId, teamId),
          eq(projections.projType, projType),
        ),
      )
      .get();

    // 3. hash 비교 — 같으면 스킵
    if (existing && existing.sourceHash === graph.contentHash) {
      return false;
    }

    // 4. Markdown 생성
    const content = this.buildMatrixProjection(jsonld);

    // 5. upsert
    await this.db
      .insert(projections)
      .values({
        id: crypto.randomUUID(),
        scopeType: "org",
        scopeId: teamId,
        projType,
        content,
        sourceHash: graph.contentHash,
        graphVersion: graph.version,
      })
      .onConflictDoUpdate({
        target: [projections.scopeType, projections.scopeId, projections.projType],
        set: {
          content,
          sourceHash: graph.contentHash,
          graphVersion: graph.version,
        },
      });

    return true;
  }

  // ─── scope → projType 매핑 ──────────────────────────────────────
  private resolveProjType(scopeType: ScopeType): ProjectionType {
    switch (scopeType) {
      case "user":
        return "USER.md";
      case "topic":
        return "TOPIC.md";
      case "org":
      case "team":
        return "SOUL.md";
    }
  }

  // ─── 템플릿 분기 ───────────────────────────────────────────────────
  private buildFromTemplate(
    graph: JsonLdGraph,
    scopeType: ScopeType,
    projType: ProjectionType,
  ): string {
    switch (projType) {
      case "USER.md":
        return this.buildUserProjection(graph);
      case "TOPIC.md":
        return this.buildTopicProjection(graph);
      case "SOUL.md":
        return this.buildSoulProjection(graph, scopeType);
      case "BRIEFING.md":
        return this.buildBriefingProjection(graph);
      case "MATRIX.md":
        return this.buildMatrixProjection(graph);
    }
  }

  // ─── USER.md 템플릿 ────────────────────────────────────────────────
  private buildUserProjection(graph: JsonLdGraph): string {
    const grouped = groupNodesByType(graph["@graph"]);
    const users = grouped.get("dx:User") ?? [];
    const expertiseNodes = grouped.get("dx:Expertise") ?? [];
    const prefNodes = grouped.get("dx:Preference") ?? [];

    const user = users[0];
    const role = user ? str(user, "dx:role", "미지정") : "미지정";
    const name = user ? str(user, "dx:name", "") : "";

    const lines: string[] = [];
    lines.push("## 사용자 프로필");
    if (name) lines.push(`- **이름**: ${name}`);
    lines.push(`- **역할**: ${role}`);
    lines.push("");

    // 전문 분야
    lines.push("## 전문 분야");
    if (expertiseNodes.length === 0) {
      lines.push("- (등록된 전문 분야 없음)");
    } else {
      for (const e of expertiseNodes) {
        const label = str(e, "dx:label", str(e, "@id"));
        const level = str(e, "dx:level", "");
        lines.push(`- ${label}${level ? ` (${level})` : ""}`);
      }
    }
    lines.push("");

    // 관심 분야
    lines.push("## 관심 분야");
    if (prefNodes.length === 0) {
      lines.push("- (등록된 관심 분야 없음)");
    } else {
      for (const p of prefNodes) {
        const label = str(p, "dx:label", str(p, "@id"));
        lines.push(`- ${label}`);
      }
    }

    return lines.join("\n");
  }

  // ─── TOPIC.md 템플릿 ───────────────────────────────────────────────
  private buildTopicProjection(graph: JsonLdGraph): string {
    const grouped = groupNodesByType(graph["@graph"]);
    const topics = grouped.get("dx:Topic") ?? [];
    const decisions = grouped.get("dx:Decision") ?? [];
    const glossary = grouped.get("dx:Glossary") ?? [];

    const topic = topics[0];
    const topicName = topic ? str(topic, "dx:name", "미정") : "미정";

    const lines: string[] = [];
    lines.push(`## 토픽: ${topicName}`);
    if (topic) {
      const desc = str(topic, "dx:description", "");
      if (desc) lines.push(`\n${desc}`);
    }
    lines.push("");

    // 주요 결정
    lines.push("## 주요 결정");
    if (decisions.length === 0) {
      lines.push("- (기록된 결정 없음)");
    } else {
      for (const d of decisions) {
        const summary = str(d, "dx:summary", str(d, "@id"));
        const date = str(d, "dx:date", "");
        lines.push(`- ${summary}${date ? ` (${date})` : ""}`);
      }
    }
    lines.push("");

    // 용어 정의
    lines.push("## 용어 정의");
    if (glossary.length === 0) {
      lines.push("- (정의된 용어 없음)");
    } else {
      for (const g of glossary) {
        const term = str(g, "dx:term", str(g, "@id"));
        const def = str(g, "dx:definition", "");
        lines.push(`- **${term}**: ${def}`);
      }
    }

    return lines.join("\n");
  }

  // ─── SOUL.md 템플릿 ────────────────────────────────────────────────
  private buildSoulProjection(
    graph: JsonLdGraph,
    scopeType: ScopeType,
  ): string {
    const grouped = groupNodesByType(graph["@graph"]);
    const users = grouped.get("dx:User") ?? [];
    const expertiseNodes = grouped.get("dx:Expertise") ?? [];
    const prefNodes = grouped.get("dx:Preference") ?? [];

    const lines: string[] = [];
    lines.push("## 성격");
    lines.push("분석적이고 직설적인 BD 어시스턴트");
    lines.push("");

    lines.push("## 원칙");
    lines.push("- 데이터 기반 판단");
    lines.push("- 한국어 기본");
    lines.push("- 비판적 사고 우선");
    lines.push("");

    // 사용자 맥락 요약 (Graph에서 직접 추출)
    lines.push("## 사용자 맥락");
    if (users.length === 0 && expertiseNodes.length === 0) {
      lines.push("- (사용자 정보 없음)");
    } else {
      for (const u of users) {
        const name = str(u, "dx:name", "");
        const role = str(u, "dx:role", "");
        if (name || role) {
          lines.push(`- ${name}${role ? ` — ${role}` : ""}`);
        }
      }
      if (expertiseNodes.length > 0) {
        const labels = expertiseNodes.map((e) => str(e, "dx:label", str(e, "@id")));
        lines.push(`- 전문 분야: ${labels.join(", ")}`);
      }
      if (prefNodes.length > 0) {
        const labels = prefNodes.map((p) => str(p, "dx:label", str(p, "@id")));
        lines.push(`- 관심 분야: ${labels.join(", ")}`);
      }
    }
    lines.push("");

    lines.push(`## 범위`);
    lines.push(`- scope: ${scopeType}`);

    return lines.join("\n");
  }

  // ─── BRIEFING.md 템플릿 ────────────────────────────────────────────
  private buildBriefingProjection(graph: JsonLdGraph): string {
    const grouped = groupNodesByType(graph["@graph"]);
    const signals = grouped.get("dx:Signal") ?? [];
    const topics = grouped.get("dx:Topic") ?? [];
    const decisions = grouped.get("dx:Decision") ?? [];

    const lines: string[] = [];
    lines.push("## 일간 브리핑");
    lines.push("");

    // 주요 시그널
    lines.push("### 주요 시그널");
    if (signals.length === 0) {
      lines.push("- (새로운 시그널 없음)");
    } else {
      for (const s of signals) {
        const summary = str(s, "dx:summary", str(s, "dx:label", str(s, "@id")));
        const importance = s["dx:importance"];
        const suffix = typeof importance === "number" ? ` [중요도: ${importance}]` : "";
        lines.push(`- ${summary}${suffix}`);
      }
    }
    lines.push("");

    // 토픽 업데이트
    lines.push("### 토픽 업데이트");
    if (topics.length === 0 && decisions.length === 0) {
      lines.push("- (업데이트 없음)");
    } else {
      for (const t of topics) {
        lines.push(`- **${str(t, "dx:name", str(t, "@id"))}**: 활성`);
      }
      for (const d of decisions) {
        lines.push(`- 결정: ${str(d, "dx:summary", str(d, "@id"))}`);
      }
    }

    return lines.join("\n");
  }

  // ─── MATRIX.md 템플릿 ────────────────────────────────────────────
  /** MATRIX.md Projection 빌드 — Graph에서 Matrix 요약 Markdown 생성 */
  private buildMatrixProjection(graph: JsonLdGraph): string {
    const grouped = groupNodesByType(graph["@graph"]);
    const industriesArr = grouped.get("mx:Industry") ?? [];
    const functionsArr = grouped.get("mx:Function") ?? [];
    const cells = grouped.get("mx:Cell") ?? [];
    const scores = grouped.get("mx:Score") ?? [];

    const lines: string[] = [];
    lines.push("## 산업×기능 매트릭스 현황");
    lines.push("");

    // 상위 기회 (Composite Score 기준, 상위 10개)
    lines.push("### 상위 기회 (Composite Score 기준)");
    const cellsWithScore = cells
      .filter(
        (c) =>
          typeof c["compositeScore"] === "number" ||
          typeof c["mx:compositeScore"] === "number",
      )
      .map((c) => ({
        node: c,
        score: (
          typeof c["compositeScore"] === "number"
            ? c["compositeScore"]
            : c["mx:compositeScore"]
        ) as number,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    if (cellsWithScore.length === 0) {
      lines.push("- (스코어가 등록된 셀 없음)");
    } else {
      for (const { node, score } of cellsWithScore) {
        const name = str(node, "name", node["@id"]);
        lines.push(`- ${name}: ${score.toFixed(1)}`);
      }
    }
    lines.push("");

    // Time Horizon 분포
    lines.push("### Time Horizon 분포");
    const horizonCount = { short: 0, mid: 0, long: 0 };
    for (const c of cells) {
      const h = (c["timeHorizon"] ?? c["mx:timeHorizon"]) as string;
      if (h === "short") horizonCount.short++;
      else if (h === "mid") horizonCount.mid++;
      else if (h === "long") horizonCount.long++;
    }
    lines.push(`- 단기(0~3개월): ${horizonCount.short}건`);
    lines.push(`- 중기(1~2년): ${horizonCount.mid}건`);
    lines.push(`- 장기(3년 이내): ${horizonCount.long}건`);
    lines.push("");

    // 파이프라인 분포
    lines.push("### 파이프라인 분포");
    const stageCount = new Map<string, number>();
    for (const c of cells) {
      const stage =
        ((c["pipelineStage"] ?? c["mx:pipelineStage"]) as string) || "unknown";
      stageCount.set(stage, (stageCount.get(stage) ?? 0) + 1);
    }
    const stageOrder = [
      "activity",
      "signal",
      "scorecard",
      "brief",
      "validation",
      "pilot_ready",
    ];
    const stageLabels: Record<string, string> = {
      activity: "S0 (Activity)",
      signal: "S1 (Signal)",
      scorecard: "S2 (Scorecard)",
      brief: "S2 (Brief)",
      validation: "S3 (Validation)",
      pilot_ready: "S4 (Pilot-ready)",
    };
    let hasStage = false;
    for (const stage of stageOrder) {
      const count = stageCount.get(stage) ?? 0;
      if (count > 0) {
        const label = stageLabels[stage] ?? stage;
        lines.push(`- ${label}: ${count}건`);
        hasStage = true;
      }
    }
    if (!hasStage) {
      lines.push("- (파이프라인 데이터 없음)");
    }
    lines.push("");

    // 매트릭스 규모
    lines.push("### 매트릭스 규모");
    lines.push(`- 산업: ${industriesArr.length}개`);
    lines.push(`- 기능: ${functionsArr.length}개`);
    lines.push(`- 활성 셀: ${cells.length}개`);
    lines.push(`- 스코어: ${scores.length}건`);

    return lines.join("\n");
  }
}
