/**
 * Feature Flag 관리
 * wrangler.toml [vars] 또는 Cloudflare Dashboard에서 설정
 * 값: "true" | "false" (문자열)
 */

export interface FeatureFlags {
  vectorizeSearch: boolean;
  collabWorker: boolean;
  simplifiedNav: boolean;
  aiFallback: boolean;
  requirementsAgent: boolean;
}

/**
 * Cloudflare 환경 변수에서 Feature Flag를 파싱한다.
 * Remix loader/action에서 사용:
 *   const flags = getFeatureFlags(context.cloudflare.env);
 */
export function getFeatureFlags(env: Record<string, string | undefined>): FeatureFlags {
  return {
    vectorizeSearch: env.FF_VECTORIZE_SEARCH === "true",
    collabWorker: env.FF_COLLAB_WORKER === "true",
    simplifiedNav: env.FF_SIMPLIFIED_NAV === "true",
    aiFallback: env.FF_AI_FALLBACK === "true",
    requirementsAgent: env.FF_REQUIREMENTS_AGENT === "true",
  };
}

/**
 * 특정 Feature Flag가 활성화되었는지 확인
 */
export function isFeatureEnabled(
  env: Record<string, string | undefined>,
  flag: keyof FeatureFlags,
): boolean {
  return getFeatureFlags(env)[flag];
}
