/**
 * Compliance audit tools — 감사 추적 및 근거 패키징 (Strategic Evolution F5)
 * 2개 도구: generate_audit_trail, package_evidence_for_audit
 */

import { eq } from "drizzle-orm";
import type { DB } from "~/db";
import {
  discoveries,
  experiments,
  evidence,
  eventLogs,
  gatePackages,
  messages,
} from "~/db";

// ── generate_audit_trail ──────────────────────────────────────────────────

interface GenerateAuditTrailInput {
  discoveryId: string;
  format?: string;
  dateRange?: { from?: string; to?: string };
  includeConversations?: boolean;
}

export async function generateAuditTrail(
  db: DB,
  input: GenerateAuditTrailInput
): Promise<string> {
  const discovery = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.id, input.discoveryId))
    .limit(1);

  if (!discovery[0]) {
    return JSON.stringify({ error: "Discovery를 찾을 수 없습니다." });
  }

  const d = discovery[0];
  const format = input.format || "markdown";

  // 1. Event logs 수집
  const eventsQuery = db
    .select()
    .from(eventLogs)
    .where(eq(eventLogs.discoveryId, input.discoveryId))
    .orderBy(eventLogs.timestamp);

  const events = await eventsQuery;

  // 2. Experiments 이력
  const exps = await db
    .select()
    .from(experiments)
    .where(eq(experiments.discoveryId, input.discoveryId));

  // 3. Evidence 이력
  const evs = await db
    .select()
    .from(evidence)
    .where(eq(evidence.discoveryId, input.discoveryId));

  // 4. Gate packages
  const gates = await db
    .select()
    .from(gatePackages)
    .where(eq(gatePackages.discoveryId, input.discoveryId));

  // 5. 대화 (선택)
  if (input.includeConversations) {
    await db
      .select({
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.discoveryId, input.discoveryId))
      .orderBy(messages.createdAt)
      .limit(100);
  }

  // 날짜 필터 적용
  const fromTs = input.dateRange?.from ? new Date(input.dateRange.from).getTime() / 1000 : 0;
  const toTs = input.dateRange?.to ? new Date(input.dateRange.to).getTime() / 1000 : Date.now() / 1000;

  const filteredEvents = events.filter((e) => {
    const ts = e.timestamp ? e.timestamp.getTime() / 1000 : 0;
    return ts >= fromTs && ts <= toTs;
  });

  // 타임라인 구성
  const timeline = [
    ...filteredEvents.map((e) => ({
      time: e.timestamp?.toISOString() || "",
      type: "event",
      action: e.eventType,
      actor: e.actorId,
      details: e.metadata,
    })),
    ...exps.map((e) => ({
      time: e.createdAt?.toISOString() || "",
      type: "experiment",
      action: e.completedAt ? "completed" : "created",
      actor: null,
      details: { hypothesis: e.hypothesis, result: e.resultSummary },
    })),
    ...evs.map((e) => ({
      time: e.createdAt?.toISOString() || "",
      type: "evidence",
      action: "added",
      actor: e.createdById,
      details: { type: e.type, strength: e.strength, content: e.content?.slice(0, 100) },
    })),
  ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  if (format === "json") {
    return JSON.stringify({
      discoveryId: d.id,
      title: d.title,
      status: d.status,
      timeline,
      gateDecisions: gates.map((g) => ({
        gateType: g.gateType,
        decision: g.decision,
        decidedAt: g.decidedAt?.toISOString(),
        rationale: g.rationale,
      })),
      totalEvents: timeline.length,
    });
  }

  // Markdown 포맷
  let md = `# 감사 추적 보고서\n\n`;
  md += `## Discovery: ${d.title}\n`;
  md += `- **ID**: ${d.id}\n`;
  md += `- **상태**: ${d.status}\n`;
  md += `- **생성일**: ${d.createdAt?.toISOString()}\n`;
  md += `- **보고서 생성**: ${new Date().toISOString()}\n\n`;

  md += `## 타임라인 (${timeline.length}건)\n\n`;
  md += `| 시간 | 유형 | 행동 | 행위자 |\n`;
  md += `|------|------|------|--------|\n`;
  for (const entry of timeline) {
    md += `| ${entry.time} | ${entry.type} | ${entry.action} | ${entry.actor || "-"} |\n`;
  }

  if (gates.length > 0) {
    md += `\n## Gate 결정\n\n`;
    for (const g of gates) {
      md += `### ${g.gateType}\n`;
      md += `- 결정: ${g.decision || "PENDING"}\n`;
      md += `- 시점: ${g.decidedAt?.toISOString() || "미결"}\n`;
      md += `- 근거: ${g.rationale || "-"}\n\n`;
    }
  }

  md += `\n## 근거 목록 (${evs.length}건)\n\n`;
  for (const ev of evs) {
    md += `- **[${ev.strength}/${ev.type}]** ${ev.content?.slice(0, 80)}...\n`;
  }

  return JSON.stringify({
    discoveryId: d.id,
    format: "markdown",
    content: md,
    totalEvents: timeline.length,
  });
}

// ── package_evidence_for_audit ────────────────────────────────────────────

interface PackageEvidenceForAuditInput {
  discoveryId: string;
  auditType?: string;
  includeAttachments?: boolean;
  includeTimeline?: boolean;
}

export async function packageEvidenceForAudit(
  db: DB,
  input: PackageEvidenceForAuditInput
): Promise<string> {
  const discovery = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.id, input.discoveryId))
    .limit(1);

  if (!discovery[0]) {
    return JSON.stringify({ error: "Discovery를 찾을 수 없습니다." });
  }

  const d = discovery[0];
  const auditType = input.auditType || "internal";

  // 근거 수집
  const evs = await db
    .select()
    .from(evidence)
    .where(eq(evidence.discoveryId, input.discoveryId))
    .orderBy(evidence.createdAt);

  // Gate 패키지
  const gates = await db
    .select()
    .from(gatePackages)
    .where(eq(gatePackages.discoveryId, input.discoveryId));

  // 타임라인 (선택)
  let timeline: Array<Record<string, unknown>> = [];
  if (input.includeTimeline !== false) {
    const events = await db
      .select()
      .from(eventLogs)
      .where(eq(eventLogs.discoveryId, input.discoveryId))
      .orderBy(eventLogs.timestamp);

    timeline = events.map((e) => ({
      time: e.timestamp?.toISOString(),
      type: e.eventType,
      actor: e.actorId,
      metadata: e.metadata,
    }));
  }

  // 첨부파일 목록
  const attachments = evs
    .filter((ev) => ev.linkOrAttachment || ev.sourceUrl)
    .map((ev) => ({
      evidenceId: ev.id,
      type: ev.type,
      url: ev.linkOrAttachment || ev.sourceUrl,
    }));

  // 패키지 Markdown 생성
  let md = `# 감사 대응 근거 패키지\n\n`;
  md += `## 기본 정보\n`;
  md += `- **Discovery**: ${d.title} (${d.id})\n`;
  md += `- **감사 유형**: ${auditType}\n`;
  md += `- **현재 상태**: ${d.status}\n`;
  md += `- **패키지 생성일**: ${new Date().toISOString()}\n\n`;

  md += `## 근거 목록 (${evs.length}건)\n\n`;
  md += `| # | 유형 | 강도 | 신뢰도 | 내용 | 출처 |\n`;
  md += `|---|------|------|--------|------|------|\n`;
  evs.forEach((ev, i) => {
    md += `| ${i + 1} | ${ev.type} | ${ev.strength} | ${ev.reliabilityLabel || "-"} | ${ev.content?.slice(0, 60)}... | ${ev.sourceUrl || ev.linkOrAttachment || "-"} |\n`;
  });

  if (gates.length > 0) {
    md += `\n## Gate 결정 이력\n\n`;
    for (const g of gates) {
      md += `- **${g.gateType}**: ${g.decision || "PENDING"} (${g.decidedAt?.toISOString() || "미결"})\n`;
    }
  }

  if (timeline.length > 0) {
    md += `\n## 이벤트 타임라인 (${timeline.length}건)\n\n`;
    for (const entry of timeline.slice(-30)) {
      md += `- [${entry.time}] ${entry.type} by ${entry.actor}\n`;
    }
    if (timeline.length > 30) {
      md += `\n... 외 ${timeline.length - 30}건\n`;
    }
  }

  return JSON.stringify({
    discoveryId: d.id,
    auditType,
    evidenceCount: evs.length,
    attachmentCount: attachments.length,
    gateCount: gates.length,
    timelineCount: timeline.length,
    content: md,
    attachments: input.includeAttachments !== false ? attachments : [],
  });
}
