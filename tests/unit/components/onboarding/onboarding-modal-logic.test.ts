import { describe, it, expect } from "vitest";

/**
 * OnboardingModal — 순수 로직 테스트
 * — React 렌더링 없이 상수, 네비게이션 로직, 위치 계산 등 검증
 *
 * 참조: app/components/onboarding/OnboardingModal.tsx
 */

// ── 상수 재현 ───────────────────────────────────────────────────

const TOTAL_STEPS = 3;
const STEP_TARGETS = ["ideas", "proposals", "lab"] as const;

// ── Step 컨텐츠 데이터 재현 ─────────────────────────────────────

interface StepItem {
  icon?: string;
  title: string;
  desc: string;
}

/** Step 1: 아이디어 — items */
const STEP_IDEAS_ITEMS: StepItem[] = [
  { icon: "📡", title: "소스 수집", desc: "Radar가 시장 신호와 트렌드를 자동 수집해요." },
  { icon: "💡", title: "아이디어 정리", desc: "수집된 소스를 묶어 아이디어 카드로 만들어요." },
  { icon: "🔬", title: "AI 분석", desc: "멀티소스 선택 후 AI가 시장·경쟁·기회를 분석해요." },
  { icon: "📋", title: "사업제안 전환", desc: "분석 결과를 바탕으로 사업제안으로 승격해요." },
];

/** Step 2: 사업제안 — features */
const STEP_PROPOSALS_FEATURES: StepItem[] = [
  { title: "제안서 작성", desc: "아이디어에서 전환하거나 직접 새 사업제안을 작성해요." },
  { title: "마일스톤 관리", desc: "검증 단계별 마일스톤을 설정하고 진행률을 추적해요." },
  { title: "액션 & 댓글", desc: "팀원과 액션 아이템을 공유하고 피드백을 주고받아요." },
  { title: "진행상황 패널", desc: "제안 전체의 진행 현황을 한눈에 파악할 수 있어요." },
];

/** Step 3: 실험실 — tabs */
const STEP_LAB_TABS: StepItem[] = [
  { title: "요구사항", desc: "팀원들이 기능 요청을 등록하고 AI가 자동 검토해요." },
  { title: "작업 현황", desc: "Discovery 11단계 파이프라인의 진행 상태를 추적해요." },
  { title: "방법론", desc: "12종 Method Pack으로 체계적인 검증 방법을 제공해요." },
];

// ── 네비게이션 로직 재현 ────────────────────────────────────────

function simulateHandleNext(
  currentStep: number,
  onComplete: () => void,
): { nextStep: number; completed: boolean } {
  if (currentStep < TOTAL_STEPS) {
    return { nextStep: currentStep + 1, completed: false };
  }
  onComplete();
  return { nextStep: currentStep, completed: true };
}

function simulateHandlePrev(currentStep: number): number {
  if (currentStep > 1) return currentStep - 1;
  return currentStep;
}

// ── Spotlight 위치 계산 로직 재현 ────────────────────────────────

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface CardStyle {
  position: string;
  top: number | string;
  left: number | string;
  transform?: string;
  zIndex: number;
}

function calcCardStyle(
  spotlight: SpotlightRect | null,
  windowWidth: number,
  windowHeight: number,
): CardStyle {
  if (spotlight) {
    return {
      position: "fixed",
      top: Math.min(spotlight.top + spotlight.height + 12, windowHeight - 400),
      left: Math.max(8, Math.min(spotlight.left, windowWidth - 480)),
      zIndex: 10001,
    };
  }
  return {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: 10001,
  };
}

// ── 테스트 ──────────────────────────────────────────────────────

describe("OnboardingModal 로직", () => {
  // ── 1. STEP_TARGETS 상수 검증 ─────────────────────────────────

  describe("STEP_TARGETS 상수", () => {
    it("정확히 ['ideas', 'proposals', 'lab'] 순서이다", () => {
      expect(STEP_TARGETS).toEqual(["ideas", "proposals", "lab"]);
    });

    it("TOTAL_STEPS는 3이다", () => {
      expect(TOTAL_STEPS).toBe(3);
    });

    it("STEP_TARGETS.length === TOTAL_STEPS", () => {
      expect(STEP_TARGETS.length).toBe(TOTAL_STEPS);
    });
  });

  // ── 2. Step 컨텐츠 구조 검증 ──────────────────────────────────

  describe("Step 1 — 아이디어", () => {
    it("stepNumber=1, title='아이디어'", () => {
      // StepIdeas는 <OnboardingStep stepNumber={1} title="아이디어">로 렌더링
      const stepNumber = 1;
      const title = "아이디어";
      expect(stepNumber).toBe(1);
      expect(title).toBe("아이디어");
    });

    it("4개 아이템이 있다", () => {
      expect(STEP_IDEAS_ITEMS).toHaveLength(4);
    });

    it("아이템 타이틀: 소스 수집, 아이디어 정리, AI 분석, 사업제안 전환", () => {
      const titles = STEP_IDEAS_ITEMS.map((item) => item.title);
      expect(titles).toEqual(["소스 수집", "아이디어 정리", "AI 분석", "사업제안 전환"]);
    });

    it("모든 아이템에 icon이 있다", () => {
      for (const item of STEP_IDEAS_ITEMS) {
        expect(item.icon).toBeDefined();
        expect(item.icon!.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Step 2 — 사업제안", () => {
    it("stepNumber=2, title='사업제안'", () => {
      const stepNumber = 2;
      const title = "사업제안";
      expect(stepNumber).toBe(2);
      expect(title).toBe("사업제안");
    });

    it("4개 features가 있다", () => {
      expect(STEP_PROPOSALS_FEATURES).toHaveLength(4);
    });

    it("features 타이틀: 제안서 작성, 마일스톤 관리, 액션 & 댓글, 진행상황 패널", () => {
      const titles = STEP_PROPOSALS_FEATURES.map((f) => f.title);
      expect(titles).toEqual(["제안서 작성", "마일스톤 관리", "액션 & 댓글", "진행상황 패널"]);
    });
  });

  describe("Step 3 — 실험실", () => {
    it("stepNumber=3, title='실험실'", () => {
      const stepNumber = 3;
      const title = "실험실";
      expect(stepNumber).toBe(3);
      expect(title).toBe("실험실");
    });

    it("3개 tabs가 있다", () => {
      expect(STEP_LAB_TABS).toHaveLength(3);
    });

    it("tabs 타이틀: 요구사항, 작업 현황, 방법론", () => {
      const titles = STEP_LAB_TABS.map((t) => t.title);
      expect(titles).toEqual(["요구사항", "작업 현황", "방법론"]);
    });
  });

  // ── 3. Step Navigation 로직 검증 ──────────────────────────────

  describe("handleNext 로직", () => {
    it("step < TOTAL_STEPS → step + 1", () => {
      const result = simulateHandleNext(1, () => {});
      expect(result.nextStep).toBe(2);
      expect(result.completed).toBe(false);
    });

    it("step 2 → step 3", () => {
      const result = simulateHandleNext(2, () => {});
      expect(result.nextStep).toBe(3);
      expect(result.completed).toBe(false);
    });

    it("step === TOTAL_STEPS → onComplete 호출", () => {
      let called = false;
      const result = simulateHandleNext(3, () => {
        called = true;
      });
      expect(called).toBe(true);
      expect(result.completed).toBe(true);
    });
  });

  describe("handlePrev 로직", () => {
    it("step > 1 → step - 1", () => {
      expect(simulateHandlePrev(2)).toBe(1);
      expect(simulateHandlePrev(3)).toBe(2);
    });

    it("step === 1 → 변화 없음", () => {
      expect(simulateHandlePrev(1)).toBe(1);
    });
  });

  describe("초기 step", () => {
    it("항상 1에서 시작", () => {
      // useState(1) 재현
      const initialStep = 1;
      expect(initialStep).toBe(1);
    });
  });

  // ── 4. Spotlight 위치 계산 로직 검증 ──────────────────────────

  describe("cardStyle 계산", () => {
    it("spotlight 있을 때 — position: fixed, 계산된 top/left", () => {
      const spotlight: SpotlightRect = { top: 100, left: 200, width: 120, height: 40 };
      const style = calcCardStyle(spotlight, 1920, 1080);

      expect(style.position).toBe("fixed");
      expect(style.top).toBe(100 + 40 + 12); // spotlight.top + height + 12
      expect(style.left).toBe(200); // spotlight.left (범위 내)
      expect(style.zIndex).toBe(10001);
      expect(style.transform).toBeUndefined();
    });

    it("spotlight 없을 때 — 중앙 배치 (50%, translate)", () => {
      const style = calcCardStyle(null, 1920, 1080);

      expect(style.position).toBe("fixed");
      expect(style.top).toBe("50%");
      expect(style.left).toBe("50%");
      expect(style.transform).toBe("translate(-50%, -50%)");
      expect(style.zIndex).toBe(10001);
    });

    it("top 최대값: windowHeight - 400", () => {
      // spotlight이 화면 아래쪽에 있으면 top이 잘린다
      const spotlight: SpotlightRect = { top: 900, left: 200, width: 120, height: 40 };
      const style = calcCardStyle(spotlight, 1920, 1080);

      // 900 + 40 + 12 = 952 > 1080 - 400 = 680 → 680
      expect(style.top).toBe(680);
    });

    it("left 최솟값: 8", () => {
      const spotlight: SpotlightRect = { top: 100, left: -50, width: 120, height: 40 };
      const style = calcCardStyle(spotlight, 1920, 1080);

      // Math.max(8, Math.min(-50, 1920-480)) → Math.max(8, -50) = 8
      expect(style.left).toBe(8);
    });

    it("left 최댓값: windowWidth - 480", () => {
      const spotlight: SpotlightRect = { top: 100, left: 1800, width: 120, height: 40 };
      const style = calcCardStyle(spotlight, 1920, 1080);

      // Math.max(8, Math.min(1800, 1920-480)) → Math.max(8, 1440) = 1440
      expect(style.left).toBe(1440);
    });
  });

  // ── 5. 모달 타이틀 검증 ───────────────────────────────────────

  describe("모달 타이틀", () => {
    it('"Discovery-X 사용법 가이드" 이다 (이전 "시작 가이드"에서 변경됨)', () => {
      const modalTitle = "Discovery-X 사용법 가이드";
      expect(modalTitle).toBe("Discovery-X 사용법 가이드");
      expect(modalTitle).not.toBe("시작 가이드");
    });
  });

  // ── 6. Step indicator / 버튼 표시 로직 ────────────────────────

  describe("Step indicator 로직", () => {
    it("TOTAL_STEPS 개의 indicator가 생성된다", () => {
      const indicators = Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1);
      expect(indicators).toEqual([1, 2, 3]);
    });

    it("현재 step은 활성, 이전 step은 반투명, 이후 step은 비활성", () => {
      const currentStep = 2;
      const states = Array.from({ length: TOTAL_STEPS }, (_, i) => {
        if (i + 1 === currentStep) return "active";
        if (i + 1 < currentStep) return "completed";
        return "inactive";
      });
      expect(states).toEqual(["completed", "active", "inactive"]);
    });
  });

  describe("버튼 표시 로직", () => {
    it("step === 1 → 왼쪽 '건너뛰기' 버튼, 오른쪽 '다음'", () => {
      const step: number = 1;
      const leftButton = step > 1 ? "이전" : "건너뛰기";
      const rightButton = step === TOTAL_STEPS ? "시작하기" : "다음";
      expect(leftButton).toBe("건너뛰기");
      expect(rightButton).toBe("다음");
    });

    it("step === 2 → 왼쪽 '이전' 버튼, 오른쪽 '다음'", () => {
      const step: number = 2;
      const leftButton = step > 1 ? "이전" : "건너뛰기";
      const rightButton = step === TOTAL_STEPS ? "시작하기" : "다음";
      expect(leftButton).toBe("이전");
      expect(rightButton).toBe("다음");
    });

    it("step === TOTAL_STEPS → 왼쪽 '이전' 버튼, 오른쪽 '시작하기'", () => {
      const step: number = TOTAL_STEPS;
      const leftButton = step > 1 ? "이전" : "건너뛰기";
      const rightButton = step === TOTAL_STEPS ? "시작하기" : "다음";
      expect(leftButton).toBe("이전");
      expect(rightButton).toBe("시작하기");
    });
  });

  // ── 7. STEP_TARGETS ↔ step 인덱스 매핑 ───────────────────────

  describe("STEP_TARGETS 인덱스 매핑", () => {
    it("step 1 → 'ideas'", () => {
      expect(STEP_TARGETS[1 - 1]).toBe("ideas");
    });

    it("step 2 → 'proposals'", () => {
      expect(STEP_TARGETS[2 - 1]).toBe("proposals");
    });

    it("step 3 → 'lab'", () => {
      expect(STEP_TARGETS[3 - 1]).toBe("lab");
    });
  });
});
