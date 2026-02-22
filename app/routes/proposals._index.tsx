import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, Link } from "@remix-run/react";
import { getDb } from "~/db";
import { ProposalService } from "~/lib/services/proposal.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { PipelineView } from "~/components/proposals/PipelineView";
import { CategoryCardRow } from "~/components/proposals/CategoryCardRow";
import { DelayedProposalsRow } from "~/components/proposals/DelayedProposalsRow";
import { DELAY_THRESHOLDS } from "~/features/proposals/constants";
import type { ProposalCardData } from "~/components/proposals/ProposalCard";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  try {
    const service = new ProposalService(db);

    const [allProposals, likedIds] = await Promise.all([
      service.listWithOwnerNames(ctx.tenantId),
      service.getUserLikedIds(ctx.user.id),
    ]);
    const likedSet = new Set(likedIds);

    // Pipeline stage counts + items
    const stageGroups = new Map<string, { count: number; items: { id: string; title: string }[] }>();
    for (const p of allProposals) {
      if (!stageGroups.has(p.status)) stageGroups.set(p.status, { count: 0, items: [] });
      const g = stageGroups.get(p.status)!;
      g.count++;
      g.items.push({ id: p.id, title: p.title });
    }
    const stages = Array.from(stageGroups.entries()).map(([status, val]) => ({
      status, count: val.count, items: val.items,
    }));

    // Map to card data
    const cardData: ProposalCardData[] = allProposals.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      status: p.status,
      category: p.category,
      ownerName: p.ownerName,
      likeCount: p.likeCount,
      commentCount: p.commentCount,
      liked: likedSet.has(p.id),
      createdAt: p.createdAt ? String(p.createdAt) : null,
      updatedAt: p.updatedAt ? String(p.updatedAt) : null,
    }));

    // Group by category
    const categoryMap = new Map<string, ProposalCardData[]>();
    for (const p of cardData) {
      const cat = p.category || "미분류";
      if (!categoryMap.has(cat)) categoryMap.set(cat, []);
      categoryMap.get(cat)!.push(p);
    }
    const categories = Array.from(categoryMap.entries()).map(([category, items]) => ({
      category,
      proposals: items,
    }));

    // Delayed proposals
    const now = Math.floor(Date.now() / 1000);
    const delayed = cardData.filter((p) => {
      const threshold = DELAY_THRESHOLDS[p.status];
      if (!threshold) return false;
      const ts = p.updatedAt ? new Date(p.updatedAt).getTime() / 1000 : 0;
      return (now - ts) > threshold * 24 * 60 * 60;
    });

    return json({ stages, categories, delayed });
  } catch {
    return json({ stages: [], categories: [], delayed: [] });
  }
}

export default function ProposalsIndex() {
  const { stages, categories, delayed } = useLoaderData<typeof loader>();

  return (
    <div className="p-6 space-y-6">
      {/* Pipeline overview */}
      <PipelineView stages={stages} />

      {/* Delayed proposals */}
      <DelayedProposalsRow proposals={delayed} />

      {/* Category rows */}
      {categories.length > 0 ? (
        categories.map((cat) => (
          <CategoryCardRow
            key={cat.category}
            category={cat.category}
            proposals={cat.proposals}
          />
        ))
      ) : (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-secondary">
            <svg className="h-8 w-8 text-fg-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <h2 className="mb-2 text-lg font-semibold text-fg">
            사업제안이 없습니다
          </h2>
          <p className="mb-4 text-sm text-fg-tertiary">
            새 제안을 작성해 보세요.
          </p>
          <Link
            to="/proposals/new"
            className="inline-flex items-center gap-2 rounded-lg bg-btn-bg px-4 py-2 text-sm font-medium text-btn-text transition-colors hover:bg-btn-bg-hover"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            새 사업제안서
          </Link>
        </div>
      )}
    </div>
  );
}
