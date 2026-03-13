import { describe, it, expect } from "vitest";
import { parseGtmResult } from "~/features/prd-studio/lib/gtm-parser";

describe("parseGtmResult()", () => {
  const fullResult = JSON.stringify({
    beachheadSegment: {
      segment: "국내 50인 이하 중소기업",
      rationale: "채용 프로세스 비효율이 극대화되는 규모",
      size: "약 30만 기업",
      accessibility: "high",
    },
    icp: {
      profile: "중소기업 HR 매니저, 채용 경험 3년 이상",
      demographics: "30-40대, 수도권, IT 또는 제조업",
      psychographics: "효율 중시, 기술 수용도 높음",
      painPoints: ["이력서 수작업 검토", "채용 소요 시간 과다", "적합도 판단 어려움"],
      buyingTriggers: ["채용 시즌 시작", "이직률 증가", "기존 툴 불만"],
    },
    messaging: {
      oneLiner: "AI가 최적 인재를 즉시 매칭합니다",
      elevatorPitch: "중소기업 HR 담당자를 위한 AI 채용 매칭 플랫폼입니다. 이력서 검토 시간을 50% 단축하고 적합도를 80% 이상 보장합니다.",
      keyMessages: ["채용 시간 50% 절감", "AI 매칭 정확도 80%+", "중소기업 맞춤 가격"],
    },
    channelStrategy: {
      channels: [
        { name: "LinkedIn", priority: "primary", rationale: "HR 전문가 밀집", estimatedCost: "월 500만원" },
        { name: "HR 커뮤니티", priority: "secondary", rationale: "타겟 고객 집중", estimatedCost: "월 100만원" },
        { name: "유튜브 광고", priority: "experimental", rationale: "인지도 확대", estimatedCost: "월 300만원" },
      ],
      recommendation: "LinkedIn을 주력 채널로, HR 커뮤니티를 보조 채널로 운영한다.",
    },
    launchPlan: {
      phases: [
        { name: "사전 준비", duration: "4주", objectives: ["랜딩 페이지 구축"], actions: ["도메인 확보", "콘텐츠 작성"] },
        { name: "베타 론칭", duration: "8주", objectives: ["100명 베타 유저 확보"], actions: ["초대 코드 배포", "피드백 수집"] },
        { name: "정식 론칭", duration: "4주", objectives: ["유료 전환 10%"], actions: ["가격 정책 발표", "PR 캠페인"] },
      ],
    },
  });

  // T12: 정상 파싱 — 5섹션 전부 포함
  it("T12: 정상 JSON 파싱 — 5섹션 전체", () => {
    const result = parseGtmResult(fullResult);

    expect(result.beachheadSegment.segment).toContain("중소기업");
    expect(result.beachheadSegment.accessibility).toBe("high");
    expect(result.icp.painPoints).toHaveLength(3);
    expect(result.icp.buyingTriggers).toHaveLength(3);
    expect(result.messaging.oneLiner).toContain("AI");
    expect(result.messaging.keyMessages).toHaveLength(3);
    expect(result.channelStrategy.channels).toHaveLength(3);
    expect(result.channelStrategy.channels[0].priority).toBe("primary");
    expect(result.channelStrategy.channels[2].priority).toBe("experimental");
    expect(result.launchPlan.phases).toHaveLength(3);
    expect(result.launchPlan.phases[0].objectives).toEqual(["랜딩 페이지 구축"]);
  });

  // T13: 부분 결과 — beachheadSegment만 있어도 기본값
  it("T13: 부분 결과 — beachheadSegment만 있으면 나머지 기본값", () => {
    const partial = JSON.stringify({
      beachheadSegment: {
        segment: "스타트업",
        rationale: "혁신 수용도 높음",
        size: "5만 기업",
        accessibility: "medium",
      },
    });
    const result = parseGtmResult(partial);

    expect(result.beachheadSegment.segment).toBe("스타트업");
    expect(result.icp.profile).toBe("");
    expect(result.icp.painPoints).toEqual([]);
    expect(result.messaging.oneLiner).toBe("");
    expect(result.channelStrategy.channels).toEqual([]);
    expect(result.launchPlan.phases).toEqual([]);
  });

  // T14: channel priority 정규화 — "main" → "secondary"
  it("T14: channel priority 정규화 — 잘못된 값 → secondary", () => {
    const abnormal = JSON.stringify({
      channelStrategy: {
        channels: [
          { name: "LinkedIn", priority: "main", rationale: "test", estimatedCost: "100" },
          { name: "Twitter", priority: "PRIMARY", rationale: "test", estimatedCost: "50" },
          { name: "Blog", priority: "experimental", rationale: "test", estimatedCost: "30" },
        ],
        recommendation: "test",
      },
    });
    const result = parseGtmResult(abnormal);

    expect(result.channelStrategy.channels[0].priority).toBe("secondary");
    expect(result.channelStrategy.channels[1].priority).toBe("primary");
    expect(result.channelStrategy.channels[2].priority).toBe("experimental");
  });
});
