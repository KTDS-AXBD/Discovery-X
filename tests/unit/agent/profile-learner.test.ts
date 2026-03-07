import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import { users } from "~/db/schema";
import { agentMemoryV2 } from "~/db/schema-v2";
import { ProfileLearner } from "~/features/chat/agent/profile-learner";

describe("ProfileLearner", () => {
  let db: TestDB;
  let learner: ProfileLearner;

  beforeEach(() => {
    db = createTestDb();
    learner = new ProfileLearner(db as never);

    // 기본 사용자 시드
    db.insert(users)
      .values([
        { id: "u1", email: "u1@test.com", name: "User 1", role: "user" },
        { id: "u2", email: "u2@test.com", name: "User 2", role: "admin" },
      ])
      .run();
  });

  // ─── TF 기반 키워드 추출 (learn → extractKeywords) ──────────────────

  it("learned_pref 메모리에서 전문 마커 근처 키워드를 expertise로 추출한다", async () => {
    const now = new Date();

    db.insert(agentMemoryV2)
      .values([
        {
          userId: "u1",
          memoryType: "learned_pref",
          content: "AI 전문 분야에서 딥러닝 경험이 풍부하다",
          createdAt: now,
        },
        {
          userId: "u1",
          memoryType: "learned_pref",
          content: "클라우드 인프라 담당 역할을 수행하고 있다",
          createdAt: now,
        },
      ])
      .run();

    const result = await learner.learn("u1");

    expect(result.updated).toBe(true);
    expect(result.addedExpertise.length).toBeGreaterThan(0);
    // "딥러닝", "ai", "클라우드", "인프라" 중 하나 이상이 expertise에 포함되어야 함
    const hasRelevant = result.addedExpertise.some(
      (e) =>
        ["딥러닝", "ai", "클라우드", "인프라"].includes(e),
    );
    expect(hasRelevant).toBe(true);
  });

  it("long_term 메모리에서 빈도 높은 키워드를 interests로 추출한다", async () => {
    const now = new Date();

    db.insert(agentMemoryV2)
      .values([
        {
          userId: "u1",
          memoryType: "long_term",
          content: "블록체인 기술 동향을 파악하고 있다. 블록체인 프로젝트 참여",
          createdAt: now,
        },
        {
          userId: "u1",
          memoryType: "long_term",
          content: "블록체인 관련 스타트업 생태계 분석",
          createdAt: now,
        },
      ])
      .run();

    const result = await learner.learn("u1");

    expect(result.updated).toBe(true);
    expect(result.addedInterests.length).toBeGreaterThan(0);
    // "블록체인"이 3회 등장 → interests 상위에 포함되어야 함
    expect(result.addedInterests).toContain("블록체인");
  });

  // ─── 불용어 필터링 ──────────────────────────────────────────────────

  it("한국어 불용어를 필터링한다", async () => {
    const now = new Date();

    db.insert(agentMemoryV2)
      .values({
        userId: "u1",
        memoryType: "long_term",
        content: "그리고 하지만 그래서 때문에 이것 저것 데이터 사이언스 데이터",
        createdAt: now,
      })
      .run();

    const result = await learner.learn("u1");

    expect(result.updated).toBe(true);
    // 불용어("그리고", "하지만" 등)는 interests에 포함되지 않아야 함
    const hasStopword = result.addedInterests.some(
      (i) =>
        ["그리고", "하지만", "그래서", "때문에", "이것", "저것"].includes(i),
    );
    expect(hasStopword).toBe(false);
  });

  it("영어 불용어를 필터링한다", async () => {
    const now = new Date();

    db.insert(agentMemoryV2)
      .values({
        userId: "u1",
        memoryType: "long_term",
        content: "the and but with from kubernetes deployment kubernetes scaling kubernetes",
        createdAt: now,
      })
      .run();

    const result = await learner.learn("u1");

    expect(result.updated).toBe(true);
    // "the", "and" 등은 필터링, "kubernetes"는 포함
    const hasStopword = result.addedInterests.some(
      (i) => ["the", "and", "but", "with", "from"].includes(i),
    );
    expect(hasStopword).toBe(false);
    expect(result.addedInterests).toContain("kubernetes");
  });

  // ─── 전문 마커 감지 ──────────────────────────────────────────────────

  it("전문 마커('전문', '경험', '역할' 등) 주변 토큰을 expertise 후보로 수집한다", async () => {
    const now = new Date();

    db.insert(agentMemoryV2)
      .values({
        userId: "u1",
        memoryType: "learned_pref",
        // 정확한 마커 토큰("전문", "경험")이 독립적으로 등장해야 매칭됨
        content: "데이터 분석 전문 분야 머신러닝 경험 보유",
        createdAt: now,
      })
      .run();

    const result = await learner.learn("u1");

    expect(result.updated).toBe(true);
    // 마커("전문", "경험") 근처의 "분석", "머신러닝", "데이터" 등이 expertise에 포함
    expect(result.addedExpertise.length).toBeGreaterThan(0);
  });

  it("영어 전문 마커('expert', 'experience', 'skill') 주변 토큰도 추출한다", async () => {
    const now = new Date();

    db.insert(agentMemoryV2)
      .values({
        userId: "u1",
        memoryType: "learned_pref",
        content: "cloud architecture expert with devops experience",
        createdAt: now,
      })
      .run();

    const result = await learner.learn("u1");

    expect(result.updated).toBe(true);
    // "cloud", "architecture", "devops" 등이 expertise에 포함
    const hasRelevant = result.addedExpertise.some(
      (e) => ["cloud", "architecture", "devops"].includes(e),
    );
    expect(hasRelevant).toBe(true);
  });

  // ─── 메모리가 없으면 업데이트 안 함 ──────────────────────────────────

  it("메모리가 없으면 updated=false를 반환한다", async () => {
    const result = await learner.learn("u1");
    expect(result.updated).toBe(false);
    expect(result.addedExpertise).toHaveLength(0);
    expect(result.addedInterests).toHaveLength(0);
  });

  // ─── learnAll ────────────────────────────────────────────────────────

  it("전체 활성 사용자를 일괄 학습한다", async () => {
    const now = new Date();

    db.insert(agentMemoryV2)
      .values({
        userId: "u1",
        memoryType: "long_term",
        content: "프론트엔드 개발 리액트 프론트엔드",
        createdAt: now,
      })
      .run();

    const result = await learner.learnAll();

    // createTestDb()에 기존 시드 사용자가 있을 수 있으므로 최소 2명 이상 처리
    expect(result.processed).toBeGreaterThanOrEqual(2);
    // u1만 메모리가 있으므로 최소 1명 업데이트
    expect(result.updated).toBeGreaterThanOrEqual(1);
  });

  // ─── 중복 방지 ──────────────────────────────────────────────────────

  it("이미 등록된 expertise/interests는 중복 추가하지 않는다", async () => {
    const now = new Date();

    db.insert(agentMemoryV2)
      .values({
        userId: "u1",
        memoryType: "learned_pref",
        content: "AI 전문 분야 딥러닝 경험",
        createdAt: now,
      })
      .run();

    // 1회 학습
    const firstResult = await learner.learn("u1");
    expect(firstResult.updated).toBe(true);
    const firstExpertiseCount = firstResult.addedExpertise.length;

    // 2회 학습 — 동일 메모리이므로 중복 없이 updated=false
    const secondResult = await learner.learn("u1");
    expect(secondResult.addedExpertise).toHaveLength(0);
    expect(firstExpertiseCount).toBeGreaterThan(0);
  });
});
