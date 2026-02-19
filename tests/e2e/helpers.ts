import type { Page } from "@playwright/test";

/**
 * E2E 테스트 공통 헬퍼
 *
 * 인증: Google OAuth 기반이므로 E2E에서 직접 로그인 불가.
 * - storageState 기반 세션 재사용 (설정 시)
 * - 인증 필요 페이지는 test.skip 처리
 */

/** 지정 경로로 이동 */
export async function navigateTo(page: Page, path: string) {
  await page.goto(path);
}

/** 네트워크 안정화 대기 */
export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState("networkidle");
}

/** 특정 텍스트가 화면에 나타날 때까지 대기 */
export async function waitForText(page: Page, text: string | RegExp) {
  await page.getByText(text).first().waitFor({ state: "visible" });
}

/** GNB 탭 목록 (TopNav NAV_TABS 기준) */
export const NAV_TABS = [
  { path: "/dashboard", label: "대시보드" },
  { path: "/ideas", label: "아이디어" },
  { path: "/proposals", label: "사업제안" },
  { path: "/signals", label: "시그널" },
  { path: "/lab", label: "실험실" },
] as const;

/** 실험실 하위 탭 (lab.tsx TABS 기준) */
export const LAB_TABS = [
  { path: "/lab", label: "개요" },
  { path: "/lab/analysis", label: "분석" },
  { path: "/lab/review", label: "검토 큐" },
  { path: "/lab/methods", label: "방법론" },
  { path: "/lab/matrix", label: "매트릭스" },
] as const;
