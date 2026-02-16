import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import type { Action } from "./types";
import { isFeatureEnabled } from "~/lib/feature-flags";
import { ScopeResolver } from "./resolver";

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
  action: Action,
): Promise<void> {
  const env = args.context.cloudflare.env as unknown as Record<string, string>;

  // Feature Flag 비활성화 시 패스
  if (!isFeatureEnabled(env, "aclScope")) {
    return;
  }

  const db = getDb(args.context.cloudflare.env.DB);
  const secret = getSessionSecret(env);
  const user = await getUserFromSession(args.request, db, secret);

  if (!user) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const resolver = new ScopeResolver(db);
  const scope = resolver.extractScope(new URL(args.request.url).pathname);

  // scope를 추출할 수 없는 경로는 ACL 대상 아님 — 허용
  if (!scope) {
    return;
  }

  const result = await resolver.resolve({
    userId: user.id,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    action,
  });

  if (!result.allowed) {
    // 감사 로그 기록 (non-blocking, 실패해도 403은 반환)
    try {
      const { aclAuditLogs } = await import("~/db/schema-v2");
      await db.insert(aclAuditLogs).values({
        userId: user.id,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        action,
        result: "denied",
      });
    } catch {
      // 로깅 실패는 무시 — 보안 검사가 우선
    }
    throw new Response("Forbidden", { status: 403 });
  }
}
