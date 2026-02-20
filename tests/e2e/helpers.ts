import { expect, type Page } from "@playwright/test";

/**
 * E2E 테스트 공통 헬퍼
 *
 * 인증: Google OAuth 기반이므로 E2E에서 직접 로그인 불가.
 * - storageState 기반 세션 재사용 (설정 시)
 * - 인증 필요 페이지는 skipIfNoAuth 처리
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

/**
 * 인증 필요 테스트 스킵 조건.
 * describe 블록 내에서 호출하면 해당 스위트 전체를 건너뛴다.
 */
export function skipIfNoAuth(
  test: { skip: (condition: boolean, description: string) => void },
) {
  test.skip(
    !process.env.E2E_SESSION_COOKIE,
    "E2E_SESSION_COOKIE 미설정 — 인증 필요 테스트 스킵",
  );
}

/** API 응답 대기 (network 요청 매칭) */
export async function waitForApiResponse(
  page: Page,
  urlPattern: string | RegExp,
) {
  return page.waitForResponse((resp) => {
    const url = resp.url();
    if (typeof urlPattern === "string") return url.includes(urlPattern);
    return urlPattern.test(url);
  });
}

/** 모달이 열릴 때까지 대기 */
export async function waitForModal(page: Page) {
  await page
    .locator('[role="dialog"]')
    .first()
    .waitFor({ state: "visible" });
}

/** 토스트 메시지 대기 */
export async function waitForToast(page: Page, text?: string | RegExp) {
  const toast = page.locator('[role="alert"], [data-toast]').first();
  await toast.waitFor({ state: "visible" });
  if (text) {
    await expect(toast).toContainText(text);
  }
  return toast;
}

/** 안전한 페이지 네비게이션 (로드 + 하이드레이션 대기) */
export async function safeNavigate(page: Page, path: string) {
  await page.goto(path, { waitUntil: "networkidle" });
  // Remix 하이드레이션 대기
  await page.waitForFunction(() => document.readyState === "complete");
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
