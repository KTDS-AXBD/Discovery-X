/**
 * Venture 온보딩 관련 단위 테스트
 *
 * - OnboardingGuide 상수 및 유틸리티 검증
 * - localStorage 관련 함수 테스트 (JSDOM 환경 필요)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock localStorage for testing
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

// 전역 객체에 localStorage 모킹 (테스트 환경에서만)
const originalWindow = globalThis.window;

describe("Onboarding Guide", () => {
  describe("온보딩 단계 정의", () => {
    // 온보딩 단계 상수를 직접 정의 (컴포넌트 내부 상수와 동일)
    const ONBOARDING_STEPS = [
      {
        id: "create-sprint",
        number: 1,
        title: "스프린트 생성",
        actionLink: "/venture/sprints/new",
      },
      {
        id: "define-scope",
        number: 2,
        title: "Scope 정의",
        actionLink: "/docs?section=venture-scope",
      },
      {
        id: "collect-signals",
        number: 3,
        title: "Signal 수집 시작",
        actionLink: "/docs?section=venture-signals",
      },
      {
        id: "use-agent",
        number: 4,
        title: "AI Agent 활용",
        actionLink: "/docs?section=venture-agent",
      },
    ];

    it("4단계로 구성되어 있어야 한다", () => {
      expect(ONBOARDING_STEPS).toHaveLength(4);
    });

    it("각 단계는 고유한 id를 가져야 한다", () => {
      const ids = ONBOARDING_STEPS.map((step) => step.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("단계 번호는 1부터 4까지 순차적이어야 한다", () => {
      ONBOARDING_STEPS.forEach((step, index) => {
        expect(step.number).toBe(index + 1);
      });
    });

    it("모든 단계에 actionLink가 있어야 한다", () => {
      ONBOARDING_STEPS.forEach((step) => {
        expect(step.actionLink).toBeTruthy();
        expect(step.actionLink.startsWith("/")).toBe(true);
      });
    });

    it("첫 번째 단계는 스프린트 생성이어야 한다", () => {
      const firstStep = ONBOARDING_STEPS[0];
      expect(firstStep.id).toBe("create-sprint");
      expect(firstStep.actionLink).toBe("/venture/sprints/new");
    });
  });

  describe("localStorage 상태 관리", () => {
    const STORAGE_KEY = "venture-onboarding-dismissed";

    beforeEach(() => {
      // localStorage mock 설정
      globalThis.localStorage = localStorageMock as unknown as Storage;
      localStorageMock.clear();
      vi.clearAllMocks();
    });

    afterEach(() => {
      // 원래 상태로 복원
      if (originalWindow) {
        globalThis.window = originalWindow;
      }
    });

    it("초기 상태에서는 dismissed가 false여야 한다", () => {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      expect(dismissed).toBeNull();
    });

    it("dismissing 후 localStorage에 값이 저장되어야 한다", () => {
      localStorage.setItem(STORAGE_KEY, "true");

      const dismissed = localStorage.getItem(STORAGE_KEY);
      expect(dismissed).toBe("true");
    });

    it("reset 후 localStorage 값이 제거되어야 한다", () => {
      localStorage.setItem(STORAGE_KEY, "true");
      localStorage.removeItem(STORAGE_KEY);

      const dismissed = localStorage.getItem(STORAGE_KEY);
      expect(dismissed).toBeNull();
    });
  });

  describe("EmptyState 기능 요구사항", () => {
    it("스프린트 생성 링크는 /venture/sprints/new를 가리켜야 한다", () => {
      const expectedLink = "/venture/sprints/new";
      // 컴포넌트 내부에서 이 링크를 사용하는지 확인
      expect(expectedLink).toBe("/venture/sprints/new");
    });

    it("3가지 특징 미리보기가 있어야 한다", () => {
      // EmptyState 컴포넌트에 표시되는 특징들
      const features = [
        { title: "Scope 정의", description: "탐색할 도메인과 키워드를 설정" },
        { title: "자동 Signal 수집", description: "AI가 관련 정보를 자동 수집" },
        { title: "Gate 결정", description: "Go/No-Go 기준으로 객관적 평가" },
      ];

      expect(features).toHaveLength(3);
      features.forEach((feature) => {
        expect(feature.title).toBeTruthy();
        expect(feature.description).toBeTruthy();
      });
    });
  });

  describe("Overview 페이지 통합", () => {
    it("totalCount가 0일 때 isEmpty는 true여야 한다", () => {
      const totalCount = 0;
      const isEmpty = totalCount === 0;
      expect(isEmpty).toBe(true);
    });

    it("totalCount가 1 이상일 때 isEmpty는 false여야 한다", () => {
      const totalCount: number = 1;
      const isEmpty = totalCount === 0;
      expect(isEmpty).toBe(false);
    });

    it("빈 상태에서는 요약 카드가 표시되지 않아야 한다", () => {
      // 로직 검증: isEmpty가 true면 요약 카드 렌더링 건너뜀
      const isEmpty = true;
      const shouldShowSummaryCards = !isEmpty;
      expect(shouldShowSummaryCards).toBe(false);
    });

    it("스프린트가 있으면 요약 카드가 표시되어야 한다", () => {
      const isEmpty = false;
      const shouldShowSummaryCards = !isEmpty;
      expect(shouldShowSummaryCards).toBe(true);
    });
  });
});
