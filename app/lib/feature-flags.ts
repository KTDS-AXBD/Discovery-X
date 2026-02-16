/**
 * Feature Flag 관리
 * wrangler.toml [vars] 또는 Cloudflare Dashboard에서 설정
 * 값: "true" | "false" (문자열)
 */

export interface FeatureFlags {
  graphLayer: boolean;
  agentDO: boolean;
  topicCollab: boolean;
  aclScope: boolean;
  memoryLifecycle: boolean;
  vectorizeSearch: boolean;
  pipelineBridge: boolean;
  collabWorker: boolean;
}

/**
 * Cloudflare 환경 변수에서 Feature Flag를 파싱한다.
 * Remix loader/action에서 사용:
 *   const flags = getFeatureFlags(context.cloudflare.env);
 */
export function getFeatureFlags(env: Record<string, string | undefined>): FeatureFlags {
  return {
    graphLayer: env.FF_GRAPH_LAYER === "true",
    agentDO: env.FF_AGENT_DO === "true",
    topicCollab: env.FF_TOPIC_COLLAB === "true",
    aclScope: env.FF_ACL_SCOPE === "true",
    memoryLifecycle: env.FF_MEMORY_LIFECYCLE === "true",
    vectorizeSearch: env.FF_VECTORIZE_SEARCH === "true",
    pipelineBridge: env.FF_PIPELINE_BRIDGE === "true",
    collabWorker: env.FF_COLLAB_WORKER === "true",
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
