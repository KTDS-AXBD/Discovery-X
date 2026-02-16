import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import type { Action } from "./types";
import { isFeatureEnabled } from "~/lib/feature-flags";

/**
 * Remix loader/action에서 ACL을 검사하는 미들웨어.
 * Feature Flag FF_ACL_SCOPE가 꺼져있으면 항상 허용한다.
 *
 * 사용 예:
 *   export async function loader(args: LoaderFunctionArgs) {
 *     await requireScopeAccess(args, "read");
 *     // ... 기존 로직
 *   }
 */
export async function requireScopeAccess(
  args: LoaderFunctionArgs | ActionFunctionArgs,
  _action: Action,
): Promise<void> {
  const env = args.context.cloudflare.env as unknown as Record<string, string>;

  // Feature Flag 비활성화 시 패스
  if (!isFeatureEnabled(env, "aclScope")) {
    return;
  }

  // TODO Phase 2: userId 추출, ScopeResolver 호출, 403 처리
  // const userId = await getUserIdFromSession(args);
  // const resolver = new ScopeResolver(env.DB);
  // const result = await resolver.resolve({ userId, scopeType, scopeId, action });
  // if (!result.allowed) throw new Response("Forbidden", { status: 403 });
}
