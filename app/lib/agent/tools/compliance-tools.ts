/**
 * Compliance tools — 규제·감사 대응 Agent 도구 (Strategic Evolution F5)
 * 4개 도구: generate_audit_trail, check_regulatory_compliance, package_evidence_for_audit, format_compliance_report
 */

import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { DB } from "~/db";
import {
  discoveries,
  experiments,
  evidence,
  eventLogs,
  gatePackages,
  industryAdapters,
  industryRules,
  messages,
} from "~/db/schema";

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

// ── check_regulatory_compliance ───────────────────────────────────────────

interface CheckRegulatoryComplianceInput {
  discoveryId: string;
  checklistOnly?: boolean;
  autoFix?: boolean;
}

export async function checkRegulatoryCompliance(
  db: DB,
  input: CheckRegulatoryComplianceInput
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

  // 산업 어댑터 확인
  if (!d.industryAdapterId) {
    return JSON.stringify({
      discoveryId: d.id,
      industry: null,
      overallCompliance: null,
      message: "산업 어댑터가 지정되지 않았습니다. create_discovery 또는 update_discovery에서 industryCode를 설정하세요.",
      checks: [],
    });
  }

  const adapter = await db
    .select()
    .from(industryAdapters)
    .where(eq(industryAdapters.id, d.industryAdapterId))
    .limit(1);

  if (!adapter[0]) {
    return JSON.stringify({ error: "산업 어댑터를 찾을 수 없습니다." });
  }

  // 해당 산업의 규칙 조회
  const rules = await db
    .select()
    .from(industryRules)
    .where(
      and(
        eq(industryRules.industryAdapterId, d.industryAdapterId),
        eq(industryRules.enabled, 1)
      )
    );

  // 근거 조회
  const evs = await db
    .select()
    .from(evidence)
    .where(eq(evidence.discoveryId, input.discoveryId));

  // 방법론 실행 조회
  await db
    .select()
    .from(sql`method_runs`)
    .where(sql`discovery_id = ${input.discoveryId}`);

  // 준수 사항 체크
  const complianceReqs = adapter[0].complianceRequirements || [];
  const checks: Array<{
    requirement: string;
    ruleType: string;
    status: "pass" | "fail" | "warning";
    suggestion?: string;
  }> = [];

  // 기본 체크: 준수 사항별 근거 확인
  for (const req of complianceReqs) {
    const hasRelatedEvidence = evs.some(
      (ev) => ev.content?.toLowerCase().includes(req.toLowerCase())
    );
    checks.push({
      requirement: req,
      ruleType: "compliance",
      status: hasRelatedEvidence ? "pass" : "warning",
      suggestion: hasRelatedEvidence ? undefined : `"${req}" 관련 근거를 추가하세요.`,
    });
  }

  // 산업 규칙 기반 체크
  for (const rule of rules) {
    const condition = rule.condition as Record<string, unknown> | null;
    const action = rule.action as Record<string, unknown> | null;

    // 단계 조건 확인
    if (condition?.stage) {
      const stages = condition.stage as string[];
      if (!stages.includes(d.status)) continue;
    }

    // Gate 조건 확인
    if (condition?.gateType) {
      // 현재 Gate 단계가 아니면 skip
      if (d.status !== condition.gateType) continue;
    }

    const actionType = (action?.type as string) || "warning";
    let status: "pass" | "fail" | "warning" = "warning";

    if (actionType === "block") {
      status = "fail";
    } else if (actionType === "require") {
      const checklist = (action?.checklist as string[]) || [];
      const allMet = checklist.every((item) =>
        evs.some((ev) => ev.content?.toLowerCase().includes(item.toLowerCase()))
      );
      status = allMet ? "pass" : "fail";
    }

    checks.push({
      requirement: rule.nameKo,
      ruleType: rule.ruleType,
      status,
      suggestion: status !== "pass" ? (action?.message as string) || `${rule.nameKo}을 확인하세요.` : undefined,
    });
  }

  const passCount = checks.filter((c) => c.status === "pass").length;
  const overallCompliance = checks.length > 0 ? Math.round((passCount / checks.length) * 100) : 100;

  return JSON.stringify({
    discoveryId: d.id,
    industry: adapter[0].code,
    industryName: adapter[0].nameKo,
    overallCompliance,
    checks,
    missingRequirements: checks.filter((c) => c.status === "fail").map((c) => c.requirement),
    warnings: checks.filter((c) => c.status === "warning").map((c) => c.requirement),
    recommendations: checks
      .filter((c) => c.suggestion)
      .map((c) => c.suggestion),
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

// ── format_compliance_report ──────────────────────────────────────────────

interface FormatComplianceReportInput {
  discoveryId: string;
  reportType: string;
  outputFormat?: string;
  language?: string;
}

export async function formatComplianceReport(
  db: DB,
  input: FormatComplianceReportInput
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
  const reportType = input.reportType;
  const outputFormat = input.outputFormat || "markdown";

  // 근거, 실험, Gate 수집
  const evs = await db.select().from(evidence).where(eq(evidence.discoveryId, input.discoveryId));
  const exps = await db.select().from(experiments).where(eq(experiments.discoveryId, input.discoveryId));
  const gates = await db.select().from(gatePackages).where(eq(gatePackages.discoveryId, input.discoveryId));

  // 산업 정보
  let industryName = "범용";
  if (d.industryAdapterId) {
    const adapter = await db.select().from(industryAdapters).where(eq(industryAdapters.id, d.industryAdapterId)).limit(1);
    if (adapter[0]) industryName = adapter[0].nameKo;
  }

  let content = "";

  switch (reportType) {
    case "executive_summary": {
      content = `# Executive Summary\n\n`;
      content += `## ${d.title}\n\n`;
      content += `| 항목 | 내용 |\n|------|------|\n`;
      content += `| 산업 | ${industryName} |\n`;
      content += `| 현재 단계 | ${d.status} |\n`;
      content += `| 실험 수 | ${exps.length}건 |\n`;
      content += `| 근거 수 | ${evs.length}건 |\n`;
      content += `| A/B급 근거 | ${evs.filter((e) => e.strength === "A" || e.strength === "B").length}건 |\n`;
      content += `| Gate 통과 | ${gates.filter((g) => g.decision === "GO").length}/${gates.length} |\n\n`;

      if (d.decisionRationale) {
        content += `### 의사결정 근거\n${d.decisionRationale}\n\n`;
      }

      const completedExps = exps.filter((e) => e.completedAt);
      if (completedExps.length > 0) {
        content += `### 실험 결과 요약\n`;
        for (const exp of completedExps) {
          content += `- **${exp.hypothesis}**: ${exp.resultSummary || "결과 미기록"}\n`;
        }
      }
      break;
    }

    case "detailed_audit": {
      content = `# 상세 감사 보고서\n\n`;
      content += `## 1. Discovery 개요\n`;
      content += `- **제목**: ${d.title}\n`;
      content += `- **산업**: ${industryName}\n`;
      content += `- **Seed 요약**: ${d.seedSummary}\n`;
      content += `- **생성일**: ${d.createdAt?.toISOString()}\n\n`;

      content += `## 2. 실험 이력 (${exps.length}건)\n\n`;
      for (const exp of exps) {
        content += `### 실험: ${exp.hypothesis}\n`;
        content += `- 최소 행동: ${exp.minimalAction}\n`;
        content += `- 기한: ${exp.deadline?.toISOString()}\n`;
        content += `- 완료: ${exp.completedAt ? "완료" : "진행 중"}\n`;
        content += `- 결과: ${exp.resultSummary || "-"}\n\n`;
      }

      content += `## 3. 근거 목록 (${evs.length}건)\n\n`;
      for (const ev of evs) {
        content += `### [${ev.strength}] ${ev.type}\n`;
        content += `- 내용: ${ev.content}\n`;
        content += `- 신뢰도: ${ev.reliabilityLabel || "-"}\n`;
        content += `- 출처: ${ev.sourceUrl || ev.linkOrAttachment || "-"}\n\n`;
      }

      content += `## 4. Gate 결정\n\n`;
      for (const g of gates) {
        content += `### ${g.gateType}: ${g.decision || "PENDING"}\n`;
        content += `- 근거: ${g.rationale || "-"}\n`;
        content += `- 시점: ${g.decidedAt?.toISOString() || "미결"}\n\n`;
      }
      break;
    }

    case "gate_review": {
      const latestGate = gates[gates.length - 1];
      content = `# Gate 리뷰 보고서\n\n`;
      content += `## Discovery: ${d.title}\n\n`;

      if (latestGate) {
        content += `### ${latestGate.gateType} 결과\n`;
        content += `- 결정: ${latestGate.decision || "PENDING"}\n`;
        content += `- 근거: ${latestGate.rationale || "-"}\n\n`;

        if (latestGate.scorecard) {
          content += `### 스코어카드\n`;
          content += `\`\`\`json\n${JSON.stringify(latestGate.scorecard, null, 2)}\n\`\`\`\n\n`;
        }
      } else {
        content += `Gate 패키지가 없습니다.\n\n`;
      }

      content += `### 근거 요약\n`;
      const byStrength = { A: 0, B: 0, C: 0, D: 0 };
      for (const ev of evs) {
        if (ev.strength in byStrength) byStrength[ev.strength as keyof typeof byStrength]++;
      }
      content += `| 강도 | 건수 |\n|------|------|\n`;
      for (const [k, v] of Object.entries(byStrength)) {
        content += `| ${k} | ${v} |\n`;
      }
      break;
    }

    case "compliance_checklist": {
      content = `# 규제 준수 체크리스트\n\n`;
      content += `## Discovery: ${d.title}\n`;
      content += `## 산업: ${industryName}\n\n`;

      if (d.industryAdapterId) {
        const rules = await db
          .select()
          .from(industryRules)
          .where(eq(industryRules.industryAdapterId, d.industryAdapterId));

        content += `### 산업 규칙 (${rules.length}건)\n\n`;
        for (const rule of rules) {
          content += `- [ ] **${rule.nameKo}** (${rule.ruleType})\n`;
        }

        const adapter = await db
          .select()
          .from(industryAdapters)
          .where(eq(industryAdapters.id, d.industryAdapterId))
          .limit(1);

        if (adapter[0]?.complianceRequirements) {
          const reqs = adapter[0].complianceRequirements;
          content += `\n### 준수 사항\n\n`;
          for (const req of reqs) {
            content += `- [ ] ${req}\n`;
          }
        }
      } else {
        content += `산업 어댑터가 미지정입니다.\n`;
      }
      break;
    }

    default:
      return JSON.stringify({ error: `알 수 없는 보고서 유형: ${reportType}` });
  }

  return JSON.stringify({
    discoveryId: d.id,
    reportType,
    format: outputFormat,
    industry: industryName,
    content,
  });
}
