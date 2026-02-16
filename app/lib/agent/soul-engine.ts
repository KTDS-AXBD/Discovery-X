/**
 * SoulEngine — Projection 기반 시스템 프롬프트 조립 엔진.
 * Graph Layer의 Projection(USER.md, SOUL.md, BRIEFING.md, TOPIC.md)을
 * 레이어링하여 사용자·토픽별 맞춤 프롬프트를 생성한다.
 *
 * Graph Layer 비활성화 시 기존 buildSystemPrompt() 폴백.
 */

import type { DB } from "~/db";
import { ProjectionBuilder } from "~/lib/graph/projection";
import { buildSystemPrompt } from "~/lib/agent/system-prompt";

// ─── Autonomy Level 라벨 (v2 호환) ────────────────────────────────────
const AUTONOMY_LABELS: Record<number, string> = {
  0: "Passive — 사용자 메시지에만 응답",
  1: "Advisory — 분석과 제안만. 실행하지 않음",
  2: "Semi-auto — DISCOVERY→IDEA_CARD 자동 가능, 최종 결정은 사용자 승인 필요",
  3: "Autonomous — 전체 자율 실행 (생성→실험→판단→전환)",
};

// ─── 인터페이스 ────────────────────────────────────────────────────────
export interface SoulEngineOptions {
  db: DB;
  userId: string;
  topicId?: string;
  autonomyLevel?: number;
  /** true면 Graph Projection 기반, false면 기존 buildSystemPrompt 폴백 */
  useGraphProjection?: boolean;
}

export interface SoulPromptResult {
  systemPrompt: string;
  tokenEstimate: number;
  projectionsSummary: { type: string; available: boolean }[];
}

// ─── SOUL.md 기본 템플릿 (Cloudflare Workers — fs 접근 불가) ──────────
const BASE_SOUL_TEMPLATE = `# Discovery-X Agent — SOUL

## 성격
분석적이고 직설적인 BD(사업개발) 어시스턴트.
불확실한 정보는 솔직히 인정하고, 가정과 사실을 구분한다.

## 원칙
- **데이터 기반**: 주장에는 근거를 제시한다
- **비판적 사고**: 확증 편향을 경계하고 반론을 고려한다
- **한국어 기본**: 자연스러운 한국어로 응답한다
- **행동 지향**: 분석에 그치지 않고 다음 행동을 제안한다
- **간결성**: 불필요한 서론/반복을 피하고 핵심만 전달한다

## 금지 사항
- 자동 의사결정 (Next/Hold/Drop 판단은 사용자 몫)
- 확신 없는 예측이나 추천
- 개인정보 유추
- 외부 시스템 접근 가정

## 응답 형식
- 마크다운(볼드, 리스트, 코드블록) 적극 활용
- 작업 완료 후 다음 단계 1-2개 제안
- 500자 이상 응답은 요약 헤더 포함`;

// ─── 섹션 구분자 ──────────────────────────────────────────────────────
const SECTION_SEPARATOR = "\n\n---\n\n";

// ─── SoulEngine ───────────────────────────────────────────────────────
export class SoulEngine {
  private readonly db: DB;
  private readonly userId: string;
  private readonly topicId?: string;
  private readonly autonomyLevel: number;
  private readonly useGraphProjection: boolean;

  constructor(options: SoulEngineOptions) {
    this.db = options.db;
    this.userId = options.userId;
    this.topicId = options.topicId;
    this.autonomyLevel = options.autonomyLevel ?? 3;
    this.useGraphProjection = options.useGraphProjection ?? false;
  }

  /**
   * 메인 메서드: Projection 기반 시스템 프롬프트 조립.
   * useGraphProjection=false 시 기존 buildSystemPrompt() 폴백.
   */
  async buildPrompt(): Promise<SoulPromptResult> {
    // 폴백: Graph Layer 비활성화 시 기존 v2 프롬프트
    if (!this.useGraphProjection) {
      const prompt = buildSystemPrompt();
      return {
        systemPrompt: prompt,
        tokenEstimate: this.estimateTokens(prompt),
        projectionsSummary: [
          { type: "SOUL.md (base)", available: true },
          { type: "USER.md", available: false },
          { type: "TOPIC.md", available: false },
          { type: "BRIEFING.md", available: false },
        ],
      };
    }

    // Graph Projection 기반 프롬프트 조립
    const loaded = await this.loadProjections();
    const sections: string[] = [];

    // 1. Base SOUL 템플릿
    sections.push(this.getBaseTemplate());

    // 2. USER.md (사용자 프로필·전문분야)
    const userMd = loaded.get("USER.md");
    if (userMd) {
      sections.push(userMd);
    }

    // 3. TOPIC.md (현재 토픽 컨텍스트)
    const topicMd = loaded.get("TOPIC.md");
    if (topicMd) {
      sections.push(topicMd);
    }

    // 4. BRIEFING.md (일간 브리핑)
    const briefingMd = loaded.get("BRIEFING.md");
    if (briefingMd) {
      sections.push(briefingMd);
    }

    // 5. Autonomy Level 섹션
    const autonomySection = this.buildAutonomySection();
    sections.push(autonomySection);

    const systemPrompt = sections.join(SECTION_SEPARATOR);

    return {
      systemPrompt,
      tokenEstimate: this.estimateTokens(systemPrompt),
      projectionsSummary: [
        { type: "SOUL.md (base)", available: true },
        { type: "USER.md", available: loaded.has("USER.md") },
        { type: "TOPIC.md", available: loaded.has("TOPIC.md") },
        { type: "BRIEFING.md", available: loaded.has("BRIEFING.md") },
      ],
    };
  }

  // ─── private 메서드 ──────────────────────────────────────────────────

  /** SOUL.md 기본 템플릿 (하드코딩 — Cloudflare Workers 호환) */
  private getBaseTemplate(): string {
    return BASE_SOUL_TEMPLATE;
  }

  /** Projection 조회 + 조합 */
  private async loadProjections(): Promise<Map<string, string>> {
    const builder = new ProjectionBuilder(this.db);
    const result = new Map<string, string>();

    // USER.md: user scope
    const userProj = await builder.getProjection("user", this.userId, "USER.md");
    if (userProj?.content) {
      result.set("USER.md", userProj.content);
    }

    // SOUL.md (org scope) — Graph에서 조직 수준 SOUL 오버라이드가 있으면 사용
    const orgSoul = await builder.getProjection("org", "default", "SOUL.md");
    if (orgSoul?.content) {
      result.set("ORG_SOUL.md", orgSoul.content);
    }

    // BRIEFING.md: user scope
    const briefing = await builder.getProjection("user", this.userId, "BRIEFING.md");
    if (briefing?.content) {
      result.set("BRIEFING.md", briefing.content);
    }

    // TOPIC.md: topic scope (topicId가 있을 때만)
    if (this.topicId) {
      const topicProj = await builder.getProjection("topic", this.topicId, "TOPIC.md");
      if (topicProj?.content) {
        result.set("TOPIC.md", topicProj.content);
      }
    }

    return result;
  }

  /** Autonomy Level 섹션 생성 */
  private buildAutonomySection(): string {
    const label = AUTONOMY_LABELS[this.autonomyLevel] ?? "Unknown";
    return `## 자율도 레벨\n현재 자율도: ${this.autonomyLevel} (${label})`;
  }

  /** 토큰 수 추정 (한국어 혼합 텍스트: ~3.5자/토큰) */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.5);
  }
}
