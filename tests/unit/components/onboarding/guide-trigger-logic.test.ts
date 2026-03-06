import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * 사용법 가이드 트리거 로직 테스트
 * — React 렌더링 없이 소스 코드 파싱으로 로직 검증
 *
 * 대상:
 *   - app/components/layout/TopNav.tsx (NAV_TABS, UserDropdown)
 *   - app/root.tsx (dx:open-guide 이벤트, onboarding 조건부 API)
 *   - app/components/onboarding/OnboardingModal.tsx (STEP_TARGETS)
 *   - app/routes/api.onboarding.ts (action 핸들러)
 */

const topNavSource = readFileSync(
  join(process.cwd(), "app/components/layout/TopNav.tsx"),
  "utf-8",
);
const rootSource = readFileSync(
  join(process.cwd(), "app/root.tsx"),
  "utf-8",
);
const onboardingModalSource = readFileSync(
  join(process.cwd(), "app/components/onboarding/OnboardingModal.tsx"),
  "utf-8",
);
const apiOnboardingSource = readFileSync(
  join(process.cwd(), "app/routes/api.onboarding.ts"),
  "utf-8",
);

// ── NAV_TABS onboarding 값 추출 ──────────────────────────────────

function extractNavTabOnboardingValues(source: string): string[] {
  const matches = [...source.matchAll(/onboarding:\s*"([^"]+)"/g)];
  return matches.map((m) => m[1]);
}

// ── STEP_TARGETS 추출 ────────────────────────────────────────────

function extractStepTargets(source: string): string[] {
  const match = source.match(/STEP_TARGETS\s*=\s*\[([^\]]+)\]/);
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

// ── 테스트 ──────────────────────────────────────────────────────

describe("사용법 가이드 트리거 로직", () => {
  // ── 1. NAV_TABS data-onboarding 매핑 검증 ────────────────────

  describe("NAV_TABS data-onboarding 매핑", () => {
    const onboardingValues = extractNavTabOnboardingValues(topNavSource);

    it("아이디어 탭: onboarding='ideas'", () => {
      expect(onboardingValues).toContain("ideas");
    });

    it("사업제안 탭: onboarding='proposals'", () => {
      expect(onboardingValues).toContain("proposals");
    });

    it("실험실 탭: onboarding='lab'", () => {
      expect(onboardingValues).toContain("lab");
    });

    it("모든 NAV_TABS에 onboarding 속성이 존재한다 (3개)", () => {
      expect(onboardingValues).toHaveLength(3);
    });

    it("NAV_TABS onboarding 값이 OnboardingModal STEP_TARGETS와 일치한다", () => {
      const stepTargets = extractStepTargets(onboardingModalSource);
      expect(stepTargets).toHaveLength(3);
      // 순서까지 일치해야 spotlight가 올바르게 작동
      expect(onboardingValues).toEqual(stepTargets);
    });

    it("TopNav에서 data-onboarding 속성을 렌더링한다", () => {
      expect(topNavSource).toContain("data-onboarding={tab.onboarding}");
    });
  });

  // ── 2. 사용법 가이드 버튼 존재 여부 ──────────────────────────

  describe("사용법 가이드 버튼", () => {
    it('UserDropdown에 "사용법 가이드" 텍스트가 포함된 버튼이 있다', () => {
      // UserDropdown 함수 범위에서 "사용법 가이드" 텍스트 확인
      const dropdownStart = topNavSource.indexOf("function UserDropdown");
      const dropdownEnd = topNavSource.indexOf("export function TopNav");
      const dropdownSource = topNavSource.slice(dropdownStart, dropdownEnd);

      expect(dropdownSource).toContain("사용법 가이드");
    });

    it("사용법 가이드 버튼이 <button> 요소이다", () => {
      // {/* 사용법 가이드 */} 주석 바로 다음 줄이 <button 인지 확인
      const commentIdx = topNavSource.indexOf("{/* 사용법 가이드 */}");
      expect(commentIdx).toBeGreaterThan(-1);
      const afterComment = topNavSource.slice(commentIdx, commentIdx + 200);
      expect(afterComment).toContain("<button");
    });
  });

  // ── 3. Custom Event 연결 로직 ────────────────────────────────

  describe("Custom Event 연결 (dx:open-guide)", () => {
    it('TopNav에서 CustomEvent("dx:open-guide")를 dispatch한다', () => {
      expect(topNavSource).toContain('new CustomEvent("dx:open-guide")');
    });

    it('root.tsx에서 "dx:open-guide" 이벤트를 addEventListener한다', () => {
      expect(rootSource).toContain('"dx:open-guide"');
      expect(rootSource).toContain("addEventListener");
    });

    it("TopNav dispatch와 root.tsx listener의 이벤트 이름이 일치한다", () => {
      const dispatchMatch = topNavSource.match(
        /new\s+CustomEvent\("([^"]+)"\)/,
      );
      const listenerMatch = rootSource.match(
        /addEventListener\("([^"]+)",\s*handleOpenGuide\)/,
      );

      expect(dispatchMatch).not.toBeNull();
      expect(listenerMatch).not.toBeNull();
      expect(dispatchMatch![1]).toBe(listenerMatch![1]);
    });

    it("root.tsx에서 이벤트 리스너를 cleanup(removeEventListener)한다", () => {
      expect(rootSource).toContain('removeEventListener("dx:open-guide"');
    });
  });

  // ── 4. onboardingCompleted 조건부 API 호출 로직 ──────────────

  describe("onboardingCompleted 조건부 API 호출", () => {
    it("handleOnboardingDone: onboardingCompleted falsy일 때만 API 호출", () => {
      // handleOnboardingDone 내부에서 조건 확인
      const doneMatch = rootSource.match(
        /handleOnboardingDone[\s\S]*?(?=const\s+handle|\/\/|useEffect)/,
      );
      expect(doneMatch).not.toBeNull();
      const doneBody = doneMatch![0];

      // !data?.onboardingCompleted 조건 체크
      expect(doneBody).toContain("!data?.onboardingCompleted");
      expect(doneBody).toContain('"/api/onboarding"');
    });

    it("handleOnboardingSkip: onboardingCompleted falsy일 때만 API 호출", () => {
      const skipMatch = rootSource.match(
        /handleOnboardingSkip[\s\S]*?(?=\/\/\s*"사용법|useEffect)/,
      );
      expect(skipMatch).not.toBeNull();
      const skipBody = skipMatch![0];

      expect(skipBody).toContain("!data?.onboardingCompleted");
      expect(skipBody).toContain('"/api/onboarding"');
    });

    it("이미 complete된 유저가 재열기 후 닫으면 API 호출을 하지 않는다 (조건부 분기)", () => {
      // 두 핸들러 모두 !data?.onboardingCompleted 가드가 있으므로,
      // onboardingCompleted가 true면 fetch가 실행되지 않음

      // handleOnboardingDone 함수 블록 추출
      const doneStart = rootSource.indexOf("handleOnboardingDone");
      const doneBlock = rootSource.slice(doneStart, doneStart + 400);

      // if (!data?.onboardingCompleted) 가드 안에 fetch가 있는지 확인
      expect(doneBlock).toContain("!data?.onboardingCompleted");
      expect(doneBlock).toContain("fetch");

      // handleOnboardingSkip도 동일한 가드 보유
      const skipStart = rootSource.indexOf("handleOnboardingSkip");
      const skipBlock = rootSource.slice(skipStart, skipStart + 400);
      expect(skipBlock).toContain("!data?.onboardingCompleted");
      expect(skipBlock).toContain("fetch");
    });

    it("API 호출 시 PATCH 메서드를 사용한다", () => {
      expect(rootSource).toContain('method: "PATCH"');
    });

    it('API 호출 시 action: "complete"을 전송한다', () => {
      expect(rootSource).toContain('action: "complete"');
    });
  });

  // ── 5. API 엔드포인트 검증 ───────────────────────────────────

  describe("api.onboarding.ts 엔드포인트", () => {
    it('"complete" 액션을 지원한다', () => {
      expect(apiOnboardingSource).toContain('body.action === "complete"');
    });

    it('"restart" 액션을 지원한다', () => {
      expect(apiOnboardingSource).toContain('body.action === "restart"');
    });

    it("complete 액션은 onboardingCompleted를 1로 설정한다", () => {
      // complete 블록 찾기
      const completeBlock = apiOnboardingSource.match(
        /action === "complete"[\s\S]*?(?=\}\s*else)/,
      );
      expect(completeBlock).not.toBeNull();
      expect(completeBlock![0]).toContain("onboardingCompleted: 1");
    });

    it("restart 액션은 onboardingCompleted를 0으로 설정한다", () => {
      const restartBlock = apiOnboardingSource.match(
        /action === "restart"[\s\S]*?(?=\}\s*\n)/,
      );
      expect(restartBlock).not.toBeNull();
      expect(restartBlock![0]).toContain("onboardingCompleted: 0");
    });

    it("complete 액션은 onboardingCompletedAt을 설정한다", () => {
      const completeBlock = apiOnboardingSource.match(
        /action === "complete"[\s\S]*?(?=\}\s*else)/,
      );
      expect(completeBlock).not.toBeNull();
      expect(completeBlock![0]).toContain("onboardingCompletedAt:");
    });

    it("restart 액션은 onboardingCompletedAt을 null로 초기화한다", () => {
      const restartBlock = apiOnboardingSource.match(
        /action === "restart"[\s\S]*?(?=\}\s*\n)/,
      );
      expect(restartBlock).not.toBeNull();
      expect(restartBlock![0]).toContain("onboardingCompletedAt: null");
    });

    it("requireUser로 인증을 강제한다", () => {
      expect(apiOnboardingSource).toContain("requireUser");
    });
  });
});
