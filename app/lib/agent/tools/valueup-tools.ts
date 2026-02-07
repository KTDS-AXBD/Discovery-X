/**
 * Value-up Engine tools — AI 기반 기업 가치 평가 Agent 도구 (Strategic Evolution F4)
 * 4개 도구: create_valueup_assessment, run_ai_readiness_diagnosis, generate_valueup_scenario, generate_due_diligence_checklist
 */

import { eq, and, desc } from "drizzle-orm";
import type { DB } from "~/db";
import {
  discoveries,
  industryAdapters,
  industryRules,
  valueupAssessments,
  valueupScores,
  valueupScenarios,
  valueupChecklists,
  decisionLogs,
} from "~/db/schema";

const AGENT_ACTOR_ID = "system-agent";

// ── create_valueup_assessment ─────────────────────────────────────────────

interface CreateValueupAssessmentInput {
  targetName: string;
  targetDescription?: string;
  assessmentType: string;
  discoveryId?: string;
  industryCode?: string;
  targetProfile?: Record<string, unknown>;
}

export async function createValueupAssessment(
  db: DB,
  input: CreateValueupAssessmentInput
): Promise<string> {
  const userId = AGENT_ACTOR_ID;
  // 1. industryCode → industry_adapter_id 조회
  let industryAdapterId: string | null = null;
  if (input.industryCode) {
    const adapter = await db
      .select()
      .from(industryAdapters)
      .where(eq(industryAdapters.code, input.industryCode))
      .limit(1);
    if (adapter[0]) {
      industryAdapterId = adapter[0].id;
    }
  }

  // 2. Discovery 검증 (선택)
  if (input.discoveryId) {
    const d = await db
      .select()
      .from(discoveries)
      .where(eq(discoveries.id, input.discoveryId))
      .limit(1);
    if (!d[0]) {
      return JSON.stringify({ error: "연결할 Discovery를 찾을 수 없습니다." });
    }
  }

  // 3. 레코드 생성
  const id = crypto.randomUUID();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);

  await db.insert(valueupAssessments).values({
    id,
    discoveryId: input.discoveryId || null,
    industryAdapterId,
    targetName: input.targetName,
    targetDescription: input.targetDescription || null,
    targetProfile: input.targetProfile || null,
    assessmentType: input.assessmentType,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  });

  // 4. decision_logs에 기록 (discoveryId가 있는 경우만)
  if (input.discoveryId) {
    await db.insert(decisionLogs).values({
      id: crypto.randomUUID(),
      discoveryId: input.discoveryId,
      decisionType: "valueup_creation",
      actorType: "user",
      actorId: userId,
      decisionResult: `assessment_created: ${id}`,
      inputContext: { targetName: input.targetName, assessmentType: input.assessmentType },
      createdAt: now,
    });
  }

  return JSON.stringify({
    assessmentId: id,
    targetName: input.targetName,
    assessmentType: input.assessmentType,
    industryAdapterId,
    status: "draft",
    message: `Value-up 평가 '${input.targetName}' (${input.assessmentType})가 생성되었습니다. run_ai_readiness_diagnosis로 진단을 시작하세요.`,
  });
}

// ── run_ai_readiness_diagnosis ────────────────────────────────────────────

interface RunAiReadinessDiagnosisInput {
  assessmentId: string;
  dimensions?: string[];
  useIndustryBenchmark?: boolean;
}

export async function runAiReadinessDiagnosis(
  db: DB,
  input: RunAiReadinessDiagnosisInput
): Promise<string> {
  const assessment = await db
    .select()
    .from(valueupAssessments)
    .where(eq(valueupAssessments.id, input.assessmentId))
    .limit(1);

  if (!assessment[0]) {
    return JSON.stringify({ error: "평가를 찾을 수 없습니다." });
  }

  const a = assessment[0];
  const profile = (a.targetProfile || {}) as Record<string, unknown>;

  const allDimensions = [
    "ai_readiness",
    "market_position",
    "tech_maturity",
    "culture_fit",
    "financial_health",
    "regulatory_compliance",
  ];
  const targetDimensions = input.dimensions || allDimensions;

  // 산업 벤치마크
  let benchmarkRules: Array<Record<string, unknown>> = [];
  if (input.useIndustryBenchmark !== false && a.industryAdapterId) {
    const rules = await db
      .select()
      .from(industryRules)
      .where(
        and(
          eq(industryRules.industryAdapterId, a.industryAdapterId),
          eq(industryRules.enabled, 1)
        )
      );
    benchmarkRules = rules.map((r) => ({
      name: r.nameKo,
      type: r.ruleType,
      condition: r.condition,
    }));
  }

  // 차원별 스코어링
  const scores: Array<{
    dimension: string;
    score: number;
    evidenceSummary: string;
  }> = [];

  const techStack = (profile.techStack as string[]) || [];
  const employees = (profile.employees as number) || 0;
  const revenue = String(profile.revenue || "");
  const marketPosition = String(profile.marketPosition || "");

  for (const dim of targetDimensions) {
    let score: number;
    let evidenceSummary: string;

    switch (dim) {
      case "ai_readiness": {
        const hasModernTech = techStack.some((t) =>
          ["python", "tensorflow", "pytorch", "kubernetes", "docker", "aws", "gcp", "azure"].includes(
            t.toLowerCase()
          )
        );
        score = hasModernTech ? 70 : employees > 100 ? 50 : 35;
        if (benchmarkRules.length > 0) score = Math.min(100, score + 10);
        evidenceSummary = `기술 스택 ${techStack.length}개 항목, ${hasModernTech ? "AI/ML 관련 기술 보유" : "AI/ML 기반 미확인"}`;
        break;
      }
      case "market_position": {
        score = marketPosition.includes("leader") ? 85 : marketPosition.includes("challenger") ? 70 : 50;
        evidenceSummary = `시장 포지션: ${marketPosition || "미입력"}`;
        break;
      }
      case "tech_maturity": {
        const cloudTechs = techStack.filter((t) =>
          ["kubernetes", "docker", "aws", "gcp", "azure", "serverless"].includes(t.toLowerCase())
        );
        score = Math.min(100, 30 + cloudTechs.length * 15 + (techStack.length > 5 ? 10 : 0));
        evidenceSummary = `클라우드/컨테이너 기술 ${cloudTechs.length}개, 전체 스택 ${techStack.length}개`;
        break;
      }
      case "culture_fit": {
        score = employees > 500 ? 45 : employees > 100 ? 60 : 70;
        evidenceSummary = `직원 ${employees}명, ${employees > 500 ? "대기업 구조 → 변화 수용 난이도 높음" : "중소기업 → 변화 수용 상대적 용이"}`;
        break;
      }
      case "financial_health": {
        const hasRevenue = revenue && revenue !== "0" && revenue !== "";
        score = hasRevenue ? 65 : 40;
        evidenceSummary = `매출: ${revenue || "미입력"}`;
        break;
      }
      case "regulatory_compliance": {
        score = benchmarkRules.length > 0 ? 60 + Math.min(30, benchmarkRules.length * 5) : 50;
        evidenceSummary = `산업 규제 ${benchmarkRules.length}건 확인${a.industryAdapterId ? "" : " (산업 미지정)"}`;
        break;
      }
      default: {
        score = 50;
        evidenceSummary = "기본 점수";
      }
    }

    scores.push({ dimension: dim, score, evidenceSummary });

    // valueup_scores에 저장 (기존 삭제 후 재생성)
    const existingScore = await db
      .select()
      .from(valueupScores)
      .where(
        and(
          eq(valueupScores.assessmentId, input.assessmentId),
          eq(valueupScores.dimension, dim)
        )
      )
      .limit(1);

    const scoreId = existingScore[0]?.id || crypto.randomUUID();
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);

    if (existingScore[0]) {
      await db
        .update(valueupScores)
        .set({ score, evidenceSummary, autoScored: 1, scoredAt: now })
        .where(eq(valueupScores.id, scoreId));
    } else {
      await db.insert(valueupScores).values({
        id: scoreId,
        assessmentId: input.assessmentId,
        dimension: dim,
        score,
        evidenceSummary,
        autoScored: 1,
        scoredAt: now,
      });
    }
  }

  // overall_score 계산 (가중 평균)
  const weights: Record<string, number> = {
    ai_readiness: 25,
    market_position: 20,
    tech_maturity: 20,
    culture_fit: 15,
    financial_health: 10,
    regulatory_compliance: 10,
  };

  const totalWeight = scores.reduce((sum, s) => sum + (weights[s.dimension] || 10), 0);
  const overallScore = Math.round(
    scores.reduce((sum, s) => sum + s.score * (weights[s.dimension] || 10), 0) / totalWeight
  );

  // assessment 업데이트
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await db
    .update(valueupAssessments)
    .set({
      overallScore,
      status: "in_progress",
      updatedAt: now,
    })
    .where(eq(valueupAssessments.id, input.assessmentId));

  // decision_logs에 기록 (discoveryId가 있는 경우만)
  if (a.discoveryId) {
    await db.insert(decisionLogs).values({
      id: crypto.randomUUID(),
      discoveryId: a.discoveryId,
      decisionType: "valueup_diagnosis",
      actorType: "system",
      actorId: "valueup-engine",
      decisionResult: `diagnosis_complete: score=${overallScore}`,
      inputContext: { assessmentId: input.assessmentId, dimensions: scores.length },
      createdAt: now,
    });
  }

  return JSON.stringify({
    assessmentId: input.assessmentId,
    targetName: a.targetName,
    overallScore,
    scores,
    industryBenchmarkApplied: benchmarkRules.length > 0,
    benchmarkRulesCount: benchmarkRules.length,
    status: "in_progress",
    nextStep: "generate_valueup_scenario로 전환 시나리오를 생성하세요.",
  });
}

// ── generate_valueup_scenario ─────────────────────────────────────────────

interface GenerateValueupScenarioInput {
  assessmentId: string;
  scenarioTypes?: string[];
  projectionMonths?: number;
}

export async function generateValueupScenario(
  db: DB,
  input: GenerateValueupScenarioInput
): Promise<string> {
  const assessment = await db
    .select()
    .from(valueupAssessments)
    .where(eq(valueupAssessments.id, input.assessmentId))
    .limit(1);

  if (!assessment[0]) {
    return JSON.stringify({ error: "평가를 찾을 수 없습니다." });
  }

  const a = assessment[0];
  const types = input.scenarioTypes || ["optimistic", "base", "pessimistic"];
  const months = input.projectionMonths || 24;

  // 기존 스코어 조회
  const existingScores = await db
    .select()
    .from(valueupScores)
    .where(eq(valueupScores.assessmentId, input.assessmentId));

  if (existingScores.length === 0) {
    return JSON.stringify({
      error: "스코어가 없습니다. 먼저 run_ai_readiness_diagnosis를 실행하세요.",
    });
  }

  const overallScore = a.overallScore || 50;
  const scenarios: Array<Record<string, unknown>> = [];

  // 기존 시나리오 삭제
  await db
    .delete(valueupScenarios)
    .where(eq(valueupScenarios.assessmentId, input.assessmentId));

  for (const scenarioType of types) {
    const multiplier =
      scenarioType === "optimistic" ? 1.3 : scenarioType === "pessimistic" ? 0.7 : 1.0;

    // 전환 계획
    const transformationPlan = [
      {
        phase: "Phase 1: 진단 및 PoC",
        duration: "3M",
        actions: ["현황 진단", "핵심 PoC 선정", "파일럿 팀 구성"],
        milestones: ["진단 보고서 완료", "PoC 범위 확정"],
      },
      {
        phase: "Phase 2: 핵심 전환",
        duration: "6M",
        actions: ["핵심 프로세스 AI 전환", "데이터 파이프라인 구축", "인력 교육"],
        milestones: ["핵심 프로세스 자동화 달성", "데이터 플랫폼 구축"],
      },
      {
        phase: "Phase 3: 전사 확산",
        duration: `${Math.max(6, months - 9)}M`,
        actions: ["전사 확산", "운영 안정화", "성과 측정"],
        milestones: ["전사 도입 완료", "ROI 달성"],
      },
    ];

    // 가치 예측
    const valueProjection = [];
    for (let m = 6; m <= months; m += 6) {
      const growth = Math.round((overallScore / 100) * multiplier * (m / 6) * 10);
      valueProjection.push({
        month: m,
        revenue: `+${growth}%`,
        cost: scenarioType === "pessimistic" ? `+${Math.round(growth * 0.6)}%` : `-${Math.round(growth * 0.3)}%`,
        margin: `+${Math.round(growth * (scenarioType === "pessimistic" ? 0.2 : 0.5))}%`,
        note: m <= 6 ? "초기 투자 기간" : m <= 12 ? "성과 가시화" : "안정 성장",
      });
    }

    // 리스크
    const riskBase = scenarioType === "pessimistic" ? 20 : scenarioType === "optimistic" ? -15 : 0;
    const riskFactors = [
      { factor: "인력 이탈", probability: Math.max(5, 30 + riskBase), impact: 70, mitigation: "핵심 인재 리텐션 프로그램" },
      { factor: "기술 부채", probability: Math.max(10, 45 + riskBase), impact: 60, mitigation: "단계적 레거시 전환" },
      { factor: "시장 변화", probability: Math.max(10, 25 + riskBase), impact: 80, mitigation: "시나리오별 대응 계획" },
      { factor: "규제 변경", probability: Math.max(5, 15 + riskBase), impact: 50, mitigation: "규제 동향 모니터링" },
    ];

    // 핵심 가정
    const confidenceBase = scenarioType === "optimistic" ? 15 : scenarioType === "pessimistic" ? -10 : 0;
    const keyAssumptions = [
      { assumption: "경영진의 디지털 전환 의지 유지", confidence: Math.min(95, 80 + confidenceBase), validationMethod: "분기별 경영진 인터뷰" },
      { assumption: "시장 환경 안정", confidence: Math.min(90, 65 + confidenceBase), validationMethod: "월별 시장 보고서 분석" },
      { assumption: "핵심 인력 확보 가능", confidence: Math.min(90, 70 + confidenceBase), validationMethod: "채용 파이프라인 모니터링" },
    ];

    const scenarioId = crypto.randomUUID();
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);

    await db.insert(valueupScenarios).values({
      id: scenarioId,
      assessmentId: input.assessmentId,
      scenarioType,
      transformationPlan,
      valueProjection,
      riskFactors,
      keyAssumptions,
      createdAt: now,
    });

    scenarios.push({
      scenarioId,
      scenarioType,
      transformationPlan,
      valueProjection,
      riskFactors,
      keyAssumptions,
    });
  }

  // decision_logs에 기록 (discoveryId가 있는 경우만)
  if (a.discoveryId) {
    const logNow = new Date(Math.floor(Date.now() / 1000) * 1000);
    await db.insert(decisionLogs).values({
      id: crypto.randomUUID(),
      discoveryId: a.discoveryId,
      decisionType: "valueup_scenario",
      actorType: "system",
      actorId: "valueup-engine",
      decisionResult: `scenarios_generated: ${scenarios.length}`,
      inputContext: { assessmentId: input.assessmentId, scenarioCount: scenarios.length },
      createdAt: logNow,
    });
  }

  return JSON.stringify({
    assessmentId: input.assessmentId,
    targetName: a.targetName,
    overallScore,
    scenarios,
    projectionMonths: months,
    nextStep: "generate_due_diligence_checklist로 DD 체크리스트를 생성하세요.",
  });
}

// ── generate_due_diligence_checklist ──────────────────────────────────────

interface GenerateDueDiligenceChecklistInput {
  assessmentId: string;
  checklistTypes?: string[];
}

export async function generateDueDiligenceChecklist(
  db: DB,
  input: GenerateDueDiligenceChecklistInput
): Promise<string> {
  const assessment = await db
    .select()
    .from(valueupAssessments)
    .where(eq(valueupAssessments.id, input.assessmentId))
    .limit(1);

  if (!assessment[0]) {
    return JSON.stringify({ error: "평가를 찾을 수 없습니다." });
  }

  const a = assessment[0];
  const types = input.checklistTypes || ["due_diligence"];

  // 산업별 규칙 참조
  let industryReqs: string[] = [];
  if (a.industryAdapterId) {
    const adapter = await db
      .select()
      .from(industryAdapters)
      .where(eq(industryAdapters.id, a.industryAdapterId))
      .limit(1);
    if (adapter[0]?.complianceRequirements) {
      industryReqs = adapter[0].complianceRequirements as string[];
    }
  }

  // 기존 체크리스트 삭제
  await db
    .delete(valueupChecklists)
    .where(eq(valueupChecklists.assessmentId, input.assessmentId));

  const checklists: Array<Record<string, unknown>> = [];

  for (const checklistType of types) {
    let items: Array<{ label: string; checked: boolean; note?: string; priority?: string }> = [];

    switch (checklistType) {
      case "due_diligence": {
        items = [
          { label: "재무제표 검증 (최근 3년)", checked: false, priority: "high" },
          { label: "핵심 자산 및 부채 확인", checked: false, priority: "high" },
          { label: "주요 계약 및 법적 의무 검토", checked: false, priority: "high" },
          { label: "핵심 인력 및 조직 구조 파악", checked: false, priority: "medium" },
          { label: "기술 자산 및 IP 현황 조사", checked: false, priority: "medium" },
          { label: "고객 기반 및 매출 집중도 분석", checked: false, priority: "medium" },
          { label: "경쟁 환경 및 시장 위치 평가", checked: false, priority: "medium" },
          { label: "IT 인프라 및 보안 감사", checked: false, priority: "low" },
        ];
        if (industryReqs.length > 0) {
          items.push(
            ...industryReqs.map((req) => ({
              label: `[산업 규제] ${req}`,
              checked: false,
              priority: "high" as const,
            }))
          );
        }
        break;
      }
      case "pmi": {
        items = [
          { label: "Day 1 커뮤니케이션 계획", checked: false, priority: "high" },
          { label: "핵심 인력 리텐션 프로그램", checked: false, priority: "high" },
          { label: "시스템 통합 로드맵", checked: false, priority: "high" },
          { label: "문화 통합 워크숍 일정", checked: false, priority: "medium" },
          { label: "시너지 실현 마일스톤 설정", checked: false, priority: "medium" },
          { label: "고객 안정화 계획", checked: false, priority: "medium" },
          { label: "거버넌스 체계 수립", checked: false, priority: "low" },
        ];
        break;
      }
      case "regulatory": {
        items = [
          { label: "사업 인허가 이전/재취득 확인", checked: false, priority: "high" },
          { label: "개인정보보호 규정 준수 검토", checked: false, priority: "high" },
          { label: "공정거래법 관련 신고 의무 확인", checked: false, priority: "high" },
          { label: "노동법 관련 승계 요건 검토", checked: false, priority: "medium" },
          { label: "환경 규제 준수 여부 확인", checked: false, priority: "medium" },
        ];
        if (industryReqs.length > 0) {
          items.push(
            ...industryReqs.map((req) => ({
              label: `[산업별] ${req}`,
              checked: false,
              priority: "high" as const,
            }))
          );
        }
        break;
      }
      case "technical": {
        items = [
          { label: "소스코드 품질 감사", checked: false, priority: "high" },
          { label: "기술 부채 평가", checked: false, priority: "high" },
          { label: "보안 취약점 스캔", checked: false, priority: "high" },
          { label: "API 및 통합 아키텍처 검토", checked: false, priority: "medium" },
          { label: "데이터 아키텍처 및 품질 평가", checked: false, priority: "medium" },
          { label: "클라우드 인프라 현황 파악", checked: false, priority: "medium" },
          { label: "DevOps/CI-CD 성숙도 평가", checked: false, priority: "low" },
          { label: "라이센스 및 오픈소스 감사", checked: false, priority: "low" },
        ];
        break;
      }
    }

    const checklistId = crypto.randomUUID();
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);

    await db.insert(valueupChecklists).values({
      id: checklistId,
      assessmentId: input.assessmentId,
      checklistType,
      items,
      progress: 0,
      createdAt: now,
      updatedAt: now,
    });

    checklists.push({
      checklistId,
      checklistType,
      itemCount: items.length,
      items,
    });
  }

  // assessment 상태 업데이트
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await db
    .update(valueupAssessments)
    .set({ updatedAt: now })
    .where(eq(valueupAssessments.id, input.assessmentId));

  return JSON.stringify({
    assessmentId: input.assessmentId,
    targetName: a.targetName,
    checklists,
    industryReqsApplied: industryReqs.length,
    message: `${checklists.length}개 체크리스트가 생성되었습니다 (총 ${checklists.reduce((sum, c) => sum + (c.itemCount as number), 0)}개 항목).`,
  });
}
