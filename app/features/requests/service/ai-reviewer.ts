/**
 * RequirementsAiReviewerService — LLM 기반 요구사항 분석
 * Bounded Context: requests
 * ADR-2: callLLM 직접 호출 (Worker 분리 안함)
 * ADR-4: 라우트 매니페스트 = 파일명 목록
 */

import { eq } from "drizzle-orm";
import type { DB } from "~/db";
import { featureRequests } from "../db/schema";
import { RequestClassification, RequestEventType } from "../constants";
import type { AnalyzeRequestOutput } from "../types";
import { RequirementsEntityService } from "./entity";
import { RequirementsWorkflowService } from "./workflow";
import { callLLM } from "~/lib/ai";
import type { ClaudeRequest } from "~/lib/ai";

/** 라우트 매니페스트 캐시 */
let routeManifestCache: string[] | null = null;

/** app/routes/ 파일명 목록 빌드 (런타임 캐시) */
function buildRouteManifest(): string[] {
  if (routeManifestCache) return routeManifestCache;

  // Edge 환경에서는 fs 접근 불가 → 빌드 시점 정적 목록 사용
  // import.meta.glob으로 라우트 파일 키 추출
  const routeModules = import.meta.glob("/app/routes/**/*.{ts,tsx}", { eager: false });
  routeManifestCache = Object.keys(routeModules).map((path) =>
    path.replace("/app/routes/", "").replace(/\.(ts|tsx)$/, ""),
  );
  return routeManifestCache;
}

/** SPEC.md에서 In-scope 섹션 로드 (정적 문자열) */
function loadSpecContext(): string {
  // 런타임에 파일 읽기 불가 → 핵심 스코프를 하드코딩
  return `Discovery-X In-scope:
- 관찰→행동→근거→자산 축적 실험 관리 시스템
- 11단계 상태 파이프라인 (DISCOVERY → HANDOFF/HOLD/DROP)
- Agent 채팅 + 50개 도구 (discovery/ontology/matrix/compliance 등)
- 요구사항 관리 + AI 리뷰 + 칸반 보드
- 온톨로지 그래프 (엔티티/관계 추출, 패턴 분석)
- 프레임워크 매트릭스 (4x4 평가 히트맵)
- 아이디어 워크스페이스 (메모/분석/발표자료)
- 아카이브 (폴더 관리, 사례 저장)
- KPI 지표 + 컴플라이언스 감사
- 멀티테넌트 + RBAC (admin/gatekeeper/member)`;
}

/** LLM 프롬프트 구성 */
function buildAnalysisPrompt(
  title: string,
  description: string,
  routeManifest: string[],
  specContext: string,
): string {
  return `당신은 Discovery-X 시스템의 요구사항 분석 전문가입니다.

## 시스템 컨텍스트
${specContext}

## 현재 구현된 라우트 (${routeManifest.length}개)
${routeManifest.join("\n")}

## 분석할 요구사항
제목: ${title}
설명: ${description}

## 분석 지침
1. 분류: 아래 4가지 중 하나로 분류하세요.
   - ALREADY_DONE: 이미 구현된 기능 (매칭된 라우트/기능 명시)
   - IN_PLAN: 현재 스코프에 포함된 계획 (SPEC 참조 명시)
   - NEW_VALUABLE: 새로운 가치 있는 요구사항 (구현 가치 설명)
   - OUT_OF_SCOPE: PRD 금지사항 또는 범위 밖 (이유 명시)

2. 점수 (각 0~5):
   - impact: 사용자/비즈니스 영향도
   - feasibility: 현재 아키텍처 내 구현 용이성

3. 근거: 분류 이유를 2~3문장으로 설명

4. NEW_VALUABLE인 경우: 작업계획 초안 (마크다운)

## 응답 형식 (JSON)
{
  "classification": "ALREADY_DONE|IN_PLAN|NEW_VALUABLE|OUT_OF_SCOPE",
  "impactScore": 0-5,
  "feasibilityScore": 0-5,
  "rationale": "분류 근거 설명",
  "matchedRoutes": ["매칭된 라우트 경로"],
  "matchedSpecSections": ["매칭된 스펙 섹션"],
  "workPlanDraft": "NEW_VALUABLE일 때만 작업계획 마크다운, 아니면 null"
}

JSON만 응답하세요.`;
}

interface LLMAnalysisResult {
  classification: string;
  impactScore: number;
  feasibilityScore: number;
  rationale: string;
  matchedRoutes: string[];
  matchedSpecSections: string[];
  workPlanDraft: string | null;
}

export class RequirementsAiReviewerService {
  private entity: RequirementsEntityService;
  private workflow: RequirementsWorkflowService;

  constructor(private db: DB) {
    this.entity = new RequirementsEntityService(db);
    this.workflow = new RequirementsWorkflowService(db);
  }

  /** 요구사항 AI 분석 실행 */
  async analyzeRequest(
    requestId: string,
    env: Record<string, string>,
    actorId?: string,
  ): Promise<AnalyzeRequestOutput> {
    // 1. 요구사항 조회
    const [request] = await this.db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, requestId));

    if (!request) throw new Error("요구사항을 찾을 수 없습니다.");

    // 2. OPEN → AI_REVIEWING
    await this.workflow.startAiReview(requestId, actorId);

    await this.entity.logEvent({
      requestId,
      eventType: RequestEventType.AI_REVIEW_STARTED,
      actorId,
      actorType: actorId ? "user" : "agent",
    });

    // 3. 컨텍스트 빌드
    const routeManifest = buildRouteManifest();
    const specContext = loadSpecContext();

    // 4. LLM 호출
    const apiKey = env.ANTHROPIC_API_KEY ?? "";
    const prompt = buildAnalysisPrompt(
      request.title,
      request.description,
      routeManifest,
      specContext,
    );

    const llmRequest: ClaudeRequest = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      temperature: 0.1,
      messages: [{ role: "user", content: prompt }],
    };

    const response = await callLLM(apiKey, llmRequest, { env });

    // 5. 응답 파싱
    const text = response.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");

    let analysis: LLMAnalysisResult;
    try {
      // JSON 블록 추출 (```json ... ``` 또는 순수 JSON)
      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
      analysis = JSON.parse(jsonMatch?.[1] ?? text);
    } catch {
      throw new Error(`AI 응답 파싱 실패: ${text.slice(0, 200)}`);
    }

    // 분류 검증
    const validClassifications = Object.values(RequestClassification);
    if (!validClassifications.includes(analysis.classification as typeof validClassifications[number])) {
      analysis.classification = RequestClassification.OUT_OF_SCOPE;
    }

    // 점수 클램핑
    analysis.impactScore = Math.max(0, Math.min(5, Math.round(analysis.impactScore)));
    analysis.feasibilityScore = Math.max(0, Math.min(5, Math.round(analysis.feasibilityScore)));

    // 6. 리뷰 저장
    const review = await this.entity.saveReview({
      requestId,
      classification: analysis.classification,
      impactScore: analysis.impactScore,
      feasibilityScore: analysis.feasibilityScore,
      rationale: analysis.rationale,
      matchedRoutes: analysis.matchedRoutes ?? [],
      matchedSpecSections: analysis.matchedSpecSections ?? [],
      workPlanDraft: analysis.workPlanDraft ?? undefined,
      modelId: response.model,
      tokenUsage: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
    });

    // 7. AI_REVIEWING → CLASSIFIED → HUMAN_REVIEW (또는 OUT_OF_SCOPE → REJECTED)
    await this.workflow.completeAiReview(requestId, review.id, analysis.classification);

    return {
      reviewId: review.id,
      classification: analysis.classification as AnalyzeRequestOutput["classification"],
      impactScore: analysis.impactScore,
      feasibilityScore: analysis.feasibilityScore,
      rationale: analysis.rationale,
      matchedRoutes: analysis.matchedRoutes ?? [],
      matchedSpecSections: analysis.matchedSpecSections ?? [],
      workPlanDraft: analysis.workPlanDraft ?? null,
    };
  }

  /** 분류만 반환 (DB 미저장, 읽기 전용) */
  async classifyOnly(
    requestId: string,
    env: Record<string, string>,
  ): Promise<Omit<AnalyzeRequestOutput, "reviewId">> {
    const [request] = await this.db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, requestId));

    if (!request) throw new Error("요구사항을 찾을 수 없습니다.");

    const routeManifest = buildRouteManifest();
    const specContext = loadSpecContext();
    const apiKey = env.ANTHROPIC_API_KEY ?? "";

    const prompt = buildAnalysisPrompt(
      request.title,
      request.description,
      routeManifest,
      specContext,
    );

    const response = await callLLM(apiKey, {
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      temperature: 0.1,
      messages: [{ role: "user", content: prompt }],
    }, { env });

    const text = response.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");

    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
    let analysis: LLMAnalysisResult;
    try {
      analysis = JSON.parse(jsonMatch?.[1] ?? text);
    } catch {
      throw new Error(`AI 응답 파싱 실패: ${text.slice(0, 200)}`);
    }

    return {
      classification: analysis.classification as AnalyzeRequestOutput["classification"],
      impactScore: Math.max(0, Math.min(5, Math.round(analysis.impactScore))),
      feasibilityScore: Math.max(0, Math.min(5, Math.round(analysis.feasibilityScore))),
      rationale: analysis.rationale,
      matchedRoutes: analysis.matchedRoutes ?? [],
      matchedSpecSections: analysis.matchedSpecSections ?? [],
      workPlanDraft: analysis.workPlanDraft ?? null,
    };
  }
}
