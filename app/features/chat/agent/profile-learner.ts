/**
 * ProfileLearner — 주간 자동 프로필 학습 엔진
 *
 * 사용자의 최근 agent_memory에서 패턴을 추출하여
 * Graph(user scope)를 자동 업데이트한다.
 *
 * 학습 대상:
 * 1) learned_pref 메모리에서 전문 분야/관심사 추출
 * 2) long_term 메모리에서 반복 주제 감지
 * 3) daily_log에서 최근 활동 패턴 요약
 *
 * 제약: LLM 호출 없이 순수 규칙 기반 (비용 0)
 */

import { eq, and, gte, inArray } from "drizzle-orm";
import type { DB } from "~/db";
import { agentMemoryV2 } from "~/db/schema-v2";
import { users } from "~/db/schema";
import { GraphStore } from "~/lib/graph/store";
import { ProjectionBuilder } from "~/lib/graph/projection";
import { MemoryType, ActorType } from "~/lib/types/enums";
import type { JsonLdGraph, JsonLdNode } from "~/lib/graph/types";

// ─── 타입 ────────────────────────────────────────────────────────────

export interface LearnResult {
  userId: string;
  updated: boolean;
  addedExpertise: string[];
  addedInterests: string[];
}

interface LearnAllResult {
  processed: number;
  updated: number;
}

// ─── 불용어 ──────────────────────────────────────────────────────────

const STOPWORDS_KO = new Set([
  "그리고", "하지만", "그래서", "때문에", "것이다", "등등", "이것", "저것",
  "그것", "하는", "있는", "없는", "되는", "한다", "이다", "했다", "된다",
  "위해", "대한", "통해", "같은", "또는", "그런", "이런", "저런", "모든",
  "어떤", "우리", "나는", "당신", "자신", "여기", "거기", "어디", "아주",
  "매우", "정말", "진짜", "아니", "네가", "내가", "그의", "수도", "것을",
  "것은", "것이", "에서", "으로", "부터", "까지", "에게", "한테", "이며",
  "하며", "라고", "다고", "에도", "지만", "이나", "이고",
]);

const STOPWORDS_EN = new Set([
  "the", "is", "are", "was", "were", "be", "been", "being", "have", "has",
  "had", "do", "does", "did", "will", "would", "shall", "should", "may",
  "might", "must", "can", "could", "and", "but", "or", "nor", "not", "so",
  "yet", "for", "with", "from", "this", "that", "these", "those", "then",
  "than", "when", "where", "what", "which", "who", "whom", "how", "all",
  "each", "every", "both", "few", "more", "most", "some", "any", "no",
  "its", "his", "her", "our", "your", "their", "about", "into", "over",
  "after", "before", "between", "under", "again", "also", "just", "very",
]);

/** 전문 분야 근접 키워드 — 이 단어 주변 토큰을 expertise 후보로 취급 */
const EXPERTISE_MARKERS = new Set([
  "전문", "경험", "역할", "담당", "전공", "분야", "기술", "스킬",
  "expert", "experience", "role", "skill", "proficient",
]);

// ─── ProfileLearner ──────────────────────────────────────────────────

export class ProfileLearner {
  private graphStore: GraphStore;
  private projectionBuilder: ProjectionBuilder;

  constructor(private db: DB) {
    this.graphStore = new GraphStore(db);
    this.projectionBuilder = new ProjectionBuilder(db);
  }

  /**
   * 단일 사용자 프로필 학습
   * 1) agentMemoryV2에서 최근 30일 learned_pref + long_term 조회
   * 2) 키워드/주제 빈도 추출 (TF 기반)
   * 3) 기존 Graph 조회/생성
   * 4) dx:expertise, dx:interests 보강
   * 5) Projection 재생성
   */
  async learn(userId: string): Promise<LearnResult> {
    const result: LearnResult = {
      userId,
      updated: false,
      addedExpertise: [],
      addedInterests: [],
    };

    // 1) 최근 30일 메모리 조회
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const memories = await this.db
      .select()
      .from(agentMemoryV2)
      .where(
        and(
          eq(agentMemoryV2.userId, userId),
          inArray(agentMemoryV2.memoryType, [
            MemoryType.LEARNED_PREF,
            MemoryType.LONG_TERM,
          ]),
          gte(agentMemoryV2.createdAt, thirtyDaysAgo),
        ),
      );

    if (memories.length === 0) return result;

    // 2) 키워드 추출
    const prefMemories = memories.filter(
      (m) => m.memoryType === MemoryType.LEARNED_PREF,
    );
    const allMemories = memories;

    const expertiseCandidates = this.extractExpertise(prefMemories.map((m) => m.content));
    const interestCandidates = this.extractInterests(allMemories.map((m) => m.content));

    if (expertiseCandidates.length === 0 && interestCandidates.length === 0) {
      return result;
    }

    // 3) 기존 Graph 조회
    let graph = await this.graphStore.getByScopeId("user", userId);

    if (!graph) {
      // Graph가 없으면 기본 구조로 생성
      graph = await this.graphStore.create(
        {
          scopeType: "user",
          scopeId: userId,
          jsonld: this.createDefaultJsonLd(userId),
          contentHash: "",
        },
        { actorId: "system", actorType: ActorType.SYSTEM },
      );
    }

    // 4) 기존 노드에서 이미 등록된 값 수집
    const existingExpertise = this.getExistingLabels(graph.jsonld, "dx:Expertise");
    const existingInterests = this.getExistingLabels(graph.jsonld, "dx:Preference");

    // 중복 제거
    const newExpertise = expertiseCandidates.filter(
      (e) => !existingExpertise.has(e.toLowerCase()),
    );
    const newInterests = interestCandidates.filter(
      (i) => !existingInterests.has(i.toLowerCase()),
    );

    if (newExpertise.length === 0 && newInterests.length === 0) {
      return result;
    }

    // 5) jsonld 보강
    const updatedJsonLd = structuredClone(graph.jsonld);

    for (const exp of newExpertise) {
      updatedJsonLd["@graph"].push({
        "@id": `dx:expertise-${crypto.randomUUID().slice(0, 8)}`,
        "@type": "dx:Expertise",
        "dx:label": exp,
      });
    }

    for (const interest of newInterests) {
      updatedJsonLd["@graph"].push({
        "@id": `dx:pref-${crypto.randomUUID().slice(0, 8)}`,
        "@type": "dx:Preference",
        "dx:label": interest,
      });
    }

    // 6) Graph 업데이트
    await this.graphStore.update(
      graph.id,
      updatedJsonLd,
      "weekly-profile-learn",
      { actorId: "system", actorType: ActorType.SYSTEM },
    );

    // 7) Projection 재생성
    await this.projectionBuilder.syncProjection("user", userId);

    result.updated = true;
    result.addedExpertise = newExpertise;
    result.addedInterests = newInterests;

    return result;
  }

  /**
   * 전체 활성 사용자 일괄 학습
   */
  async learnAll(): Promise<LearnAllResult> {
    const activeUsers = await this.db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.role, ["admin", "user"]));

    let processed = 0;
    let updated = 0;

    for (const user of activeUsers) {
      const userIdStr = String(user.id);
      const learnResult = await this.learn(userIdStr);
      processed++;
      if (learnResult.updated) updated++;
    }

    return { processed, updated };
  }

  // ─── 내부 헬퍼 ──────────────────────────────────────────────────────

  /**
   * learned_pref 타입 content에서 expertise 후보 추출
   * "전문", "경험", "역할" 등 마커 근처 단어를 수집
   */
  private extractExpertise(contents: string[]): string[] {
    const freq = new Map<string, number>();

    for (const content of contents) {
      const tokens = this.tokenize(content);
      for (let i = 0; i < tokens.length; i++) {
        if (EXPERTISE_MARKERS.has(tokens[i])) {
          // 마커 앞뒤 2토큰 범위의 비불용어를 expertise 후보로 수집
          const window = tokens.slice(Math.max(0, i - 2), i + 3);
          for (const w of window) {
            if (!EXPERTISE_MARKERS.has(w) && !this.isStopword(w) && w.length >= 2) {
              freq.set(w, (freq.get(w) ?? 0) + 1);
            }
          }
        }
      }
    }

    // 빈도순 상위 5개
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  /**
   * 전체 메모리 content에서 빈도 상위 10개 = interests 후보
   */
  private extractInterests(contents: string[]): string[] {
    const freq = new Map<string, number>();

    for (const content of contents) {
      const tokens = this.tokenize(content);
      for (const token of tokens) {
        if (!this.isStopword(token) && token.length >= 2) {
          freq.set(token, (freq.get(token) ?? 0) + 1);
        }
      }
    }

    // 빈도순 상위 10개
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  /** 텍스트를 공백 기준으로 토큰화 */
  private tokenize(text: string): string[] {
    return text
      .replace(/[^\w가-힣\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 0)
      .map((t) => t.toLowerCase());
  }

  /** 불용어 체크 */
  private isStopword(word: string): boolean {
    return STOPWORDS_KO.has(word) || STOPWORDS_EN.has(word);
  }

  /** Graph jsonld에서 특정 @type 노드들의 dx:label 집합 (소문자) */
  private getExistingLabels(jsonld: JsonLdGraph, nodeType: string): Set<string> {
    const labels = new Set<string>();
    for (const node of jsonld["@graph"]) {
      if (node["@type"] === nodeType) {
        const label = node["dx:label"];
        if (typeof label === "string") {
          labels.add(label.toLowerCase());
        }
      }
    }
    return labels;
  }

  /** 기본 User Graph JSON-LD 구조 */
  private createDefaultJsonLd(userId: string): JsonLdGraph {
    return {
      "@context": {
        dx: "https://discovery-x.minu.best/ns/",
      },
      "@graph": [
        {
          "@id": `dx:user-${userId}`,
          "@type": "dx:User",
          "dx:role": "미지정",
        } as JsonLdNode,
      ],
    };
  }
}
