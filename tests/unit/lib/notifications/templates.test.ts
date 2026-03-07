import { describe, it, expect } from "vitest";
import {
  buildOverdueEmail,
  buildRevisitEmail,
  buildDueSoonEmail,
  buildAutoClosedEmail,
  buildApprovalRequestEmail,
  buildGateExpiredEmail,
  buildGateReminderEmail,
  buildApprovalResultEmail,
  buildStalledStageEmail,
  buildWeeklySummaryEmail,
  buildCreditExhaustionEmail,
} from "~/lib/notifications/templates";

describe("buildOverdueEmail", () => {
  it("subject에 건수 포함, html에 Discovery 제목/ownerName 포함", () => {
    const result = buildOverdueEmail([
      { id: "d1", title: "테스트 디스커버리", dueDate: "2024-01-01", ownerName: "홍길동", daysOverdue: 3 },
      { id: "d2", title: "두번째", dueDate: "2024-01-02", ownerName: "김철수", daysOverdue: 5 },
    ]);

    expect(result.subject).toContain("2건");
    expect(result.html).toContain("테스트 디스커버리");
    expect(result.html).toContain("홍길동");
    expect(result.html).toContain("두번째");
    expect(result.html).toContain("김철수");
  });
});

describe("buildRevisitEmail", () => {
  it("subject에 건수, html에 트리거 정보 포함", () => {
    const result = buildRevisitEmail([
      { id: "r1", title: "리뷰 항목", revisitDate: "2024-03-01", triggerType: "시장 변화", triggerCondition: "경쟁사 진입" },
    ]);

    expect(result.subject).toContain("1건");
    expect(result.html).toContain("시장 변화");
    expect(result.html).toContain("경쟁사 진입");
  });
});

describe("buildDueSoonEmail", () => {
  it("subject에 건수, html에 남은 일수 표시", () => {
    const result = buildDueSoonEmail([
      { id: "e1", title: "임박 항목", dueDate: "2024-02-01", ownerName: "이영희", daysRemaining: 2 },
    ]);

    expect(result.subject).toContain("1건");
    expect(result.html).toContain("2일 남음");
    expect(result.html).toContain("임박 항목");
  });
});

describe("buildAutoClosedEmail", () => {
  it("subject에 자동 종료, html에 badge-red 클래스", () => {
    const result = buildAutoClosedEmail([
      { id: "a1", title: "종료 항목", ownerName: "박지성", daysOverdue: 10 },
    ]);

    expect(result.subject).toContain("자동 종료");
    expect(result.subject).toContain("1건");
    expect(result.html).toContain("badge-red");
    expect(result.html).toContain("종료 항목");
  });
});

describe("buildApprovalRequestEmail", () => {
  it("subject에 Discovery 제목, html에 결정 유형 (NEXT→전진)", () => {
    const result = buildApprovalRequestEmail({
      discoveryId: "ap1",
      discoveryTitle: "승인 테스트",
      ownerName: "테스트유저",
      decision: "NEXT",
    });

    expect(result.subject).toContain("승인 테스트");
    expect(result.html).toContain("전진 (NEXT)");
    expect(result.html).toContain("테스트유저");
  });
});

describe("buildGateExpiredEmail", () => {
  it("subject에 만료 건수, holdCount > 0이면 HOLD 안내", () => {
    const result = buildGateExpiredEmail({
      expiredCount: 2,
      holdCount: 1,
      items: [
        { gatePackageId: "abcdefgh-1234", reviewerId: "reviewer1-id" },
      ],
    });

    expect(result.subject).toContain("2건");
    expect(result.html).toContain("HOLD");
    expect(result.html).toContain("1건");
  });

  it("holdCount가 0이면 HOLD 안내 없음", () => {
    const result = buildGateExpiredEmail({
      expiredCount: 1,
      holdCount: 0,
      items: [
        { gatePackageId: "abcdefgh-5678", reviewerId: "reviewer2-id" },
      ],
    });

    expect(result.html).not.toContain("HOLD 상태로 전환");
  });
});

describe("buildGateReminderEmail", () => {
  it("subject에 마감 임박, html에 hoursLeft 표시", () => {
    const result = buildGateReminderEmail({
      reminderCount: 3,
      items: [
        { gatePackageId: "gate-pkg-1234", reviewerId: "rev-id-1234", hoursLeft: 12 },
      ],
    });

    expect(result.subject).toContain("마감 임박");
    expect(result.subject).toContain("3건");
    expect(result.html).toContain("12시간 남음");
  });
});

describe("buildApprovalResultEmail", () => {
  it("승인 시 승인 라벨 표시", () => {
    const result = buildApprovalResultEmail({
      discoveryId: "ar1",
      discoveryTitle: "결과 테스트",
      reviewerName: "리뷰어",
      decision: "NOT_NOW",
      approved: true,
    });

    expect(result.subject).toContain("승인");
    expect(result.html).toContain("보류 (NOT NOW)");
    expect(result.html).toContain("리뷰어");
  });

  it("거부 시 거부 라벨 표시", () => {
    const result = buildApprovalResultEmail({
      discoveryId: "ar2",
      discoveryTitle: "거부 테스트",
      reviewerName: "리뷰어2",
      decision: "DEAD_END",
      approved: false,
    });

    expect(result.subject).toContain("거부");
    expect(result.html).toContain("중단 (DEAD END)");
  });

  it("코멘트 있으면 표시", () => {
    const result = buildApprovalResultEmail({
      discoveryId: "ar3",
      discoveryTitle: "코멘트 테스트",
      reviewerName: "리뷰어3",
      decision: "NEXT",
      approved: true,
      comment: "좋은 결정입니다",
    });

    expect(result.html).toContain("좋은 결정입니다");
  });

  it("코멘트 없으면 코멘트 영역 미표시", () => {
    const result = buildApprovalResultEmail({
      discoveryId: "ar4",
      discoveryTitle: "노코멘트",
      reviewerName: "리뷰어4",
      decision: "NEXT",
      approved: true,
    });

    expect(result.html).not.toContain("💬");
  });
});

describe("buildStalledStageEmail", () => {
  it("subject에 체류 SLA, html에 daysInStage 표시", () => {
    const result = buildStalledStageEmail([
      { id: "s1", title: "정체 항목", status: "HYPOTHESIS", ownerName: "박영수", daysInStage: 20 },
    ]);

    expect(result.subject).toContain("체류 SLA");
    expect(result.subject).toContain("1건");
    expect(result.html).toContain("20일 체류");
    expect(result.html).toContain("HYPOTHESIS");
    expect(result.html).toContain("박영수");
  });
});

describe("buildWeeklySummaryEmail", () => {
  it("subject에 Active 건수, html에 statusCounts 테이블", () => {
    const result = buildWeeklySummaryEmail({
      totalActive: 15,
      statusCounts: { DISCOVERY: 3, HYPOTHESIS: 5, EXPERIMENT: 7 },
      overdueCount: 2,
      stalledCount: 1,
      newThisWeek: 4,
      completedThisWeek: 2,
    });

    expect(result.subject).toContain("Active 15건");
    expect(result.html).toContain("DISCOVERY");
    expect(result.html).toContain("HYPOTHESIS");
    expect(result.html).toContain("EXPERIMENT");
    expect(result.html).toContain("3");
    expect(result.html).toContain("5");
    expect(result.html).toContain("7");
  });
});

describe("buildCreditExhaustionEmail", () => {
  it("subject에 프로바이더 전환 정보, html에 남은 체인", () => {
    const result = buildCreditExhaustionEmail({
      exhaustedProvider: "anthropic",
      switchedToProvider: "openai",
      remainingChain: ["google", "local"],
      timestamp: "2024-01-15T10:00:00Z",
    });

    expect(result.subject).toContain("anthropic");
    expect(result.subject).toContain("openai");
    expect(result.html).toContain("google");
    expect(result.html).toContain("local");
    expect(result.html).toContain("2024-01-15T10:00:00Z");
  });

  it("남은 체인이 비어있으면 '없음' 표시", () => {
    const result = buildCreditExhaustionEmail({
      exhaustedProvider: "anthropic",
      switchedToProvider: "openai",
      remainingChain: [],
      timestamp: "2024-01-15T10:00:00Z",
    });

    expect(result.html).toContain("없음");
  });
});
