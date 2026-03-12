import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Outlet, useLoaderData } from "@remix-run/react";
import { useCallback, useSyncExternalStore } from "react";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { PrdOnboardingModal } from "~/features/prd-studio/ui/PrdOnboardingModal";

const ONBOARDING_KEY = "dx-prd-studio-onboarding-v1";

const noopSubscribe = () => () => {};

function useIsMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/**
 * localStorage 기반 온보딩 완료 여부를 SSR-safe하게 구독.
 * storage 이벤트 + 커스텀 이벤트로 동기적 re-render를 보장.
 */
function useOnboardingSeen() {
  const subscribe = useCallback((onStoreChange: () => void) => {
    window.addEventListener("storage", onStoreChange);
    window.addEventListener("onboarding-dismiss", onStoreChange);
    return () => {
      window.removeEventListener("storage", onStoreChange);
      window.removeEventListener("onboarding-dismiss", onStoreChange);
    };
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(ONBOARDING_KEY) === "true",
    () => false,
  );
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  const env = context.cloudflare.env as unknown as Record<string, string>;
  if (env.PRD_STUDIO_ENABLED === "false") {
    throw new Response("PRD Studio is not enabled", { status: 403 });
  }

  return json({ user: ctx.user });
}

export default function PrdStudioLayout() {
  const { user } = useLoaderData<typeof loader>();
  const mounted = useIsMounted();
  const seen = useOnboardingSeen();

  const dismissOnboarding = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    window.dispatchEvent(new Event("onboarding-dismiss"));
  }, []);

  const showOnboarding = mounted && !seen;

  return (
    <AppShell user={user} hideSidebar>
      <div className="flex h-full flex-col overflow-y-auto">
        <Outlet />
      </div>
      {mounted && (
        <PrdOnboardingModal
          open={showOnboarding}
          onComplete={dismissOnboarding}
          onSkip={dismissOnboarding}
        />
      )}
    </AppShell>
  );
}
