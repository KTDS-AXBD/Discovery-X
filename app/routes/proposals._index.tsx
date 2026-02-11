import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";
import { Link } from "@remix-run/react";
import { desc, eq } from "drizzle-orm";
import { getDb } from "~/db";
import { proposals } from "~/features/proposals/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return redirect("/login");
    }

    // Auto-select first proposal if available
    const first = await db
      .select({ id: proposals.id })
      .from(proposals)
      .where(eq(proposals.tenantId, ctx.tenantId))
      .orderBy(desc(proposals.updatedAt))
      .limit(1)
      .get();

    if (first) {
      return redirect(`/proposals/${first.id}`);
    }
  } catch {
    // Table might not exist
  }

  // No proposals — show empty state
  return null;
}

export default function ProposalsIndex() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--axis-surface-secondary)]">
          <svg className="h-8 w-8 text-[var(--axis-text-tertiary)]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>
        <h2 className="mb-2 text-lg font-semibold text-[var(--axis-text-primary)]">
          사업제안서를 선택하세요
        </h2>
        <p className="mb-4 text-sm text-[var(--axis-text-tertiary)]">
          왼쪽에서 기존 제안을 선택하거나 새로 작성하세요.
        </p>
        <Link
          to="/proposals/new"
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--axis-button-bg-default)] px-4 py-2 text-sm font-medium text-[var(--axis-button-text-default)] transition-colors hover:bg-[var(--axis-button-bg-hover)]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          새 사업제안서
        </Link>
      </div>
    </div>
  );
}
