import { useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { methodPacks, type MethodPack } from "~/db/schema";
import { PageLayout } from "~/components/layout/PageLayout";
import { PageHeader } from "~/components/layout/PageHeader";
import { MethodPackCard } from "~/components/methods/MethodPackCard";
import { MethodPackDetailDialog } from "~/components/methods/MethodPackDetailDialog";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env as unknown as Record<string, string>);
  const user = await getUserFromSession(request, db, secret);
  if (!user) return redirect("/login");

  const allPacks = await db.select().from(methodPacks);

  return json({ user, packs: allPacks });
}

export default function MethodsPage() {
  const { user, packs } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedPack, setSelectedPack] = useState<MethodPack | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const tierFilter = searchParams.get("tier");

  const filteredPacks = tierFilter
    ? packs.filter((p) => p.tier === tierFilter)
    : packs;

  const handleCardClick = (pack: MethodPack) => {
    setSelectedPack(pack);
    setDialogOpen(true);
  };

  const tiers = ["Tier-0", "Tier-1", "Tier-2"];

  return (
    <PageLayout user={user}>
      <PageHeader
        title="Method Pack 라이브러리"
        description="12종 방법론 팩 — 단계별 실험 도구"
      />

      {/* Tier filter */}
      <div className="mb-6 flex gap-2">
        <button
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            !tierFilter
              ? "bg-[var(--axis-surface-brand)] text-white"
              : "bg-[var(--axis-surface-secondary)] text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-default)]"
          }`}
          onClick={() => setSearchParams({})}
        >
          전체 ({packs.length})
        </button>
        {tiers.map((tier) => {
          const count = packs.filter((p) => p.tier === tier).length;
          return (
            <button
              key={tier}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                tierFilter === tier
                  ? "bg-[var(--axis-surface-brand)] text-white"
                  : "bg-[var(--axis-surface-secondary)] text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-default)]"
              }`}
              onClick={() => setSearchParams({ tier })}
            >
              {tier} ({count})
            </button>
          );
        })}
      </div>

      {/* Pack grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredPacks.map((pack, idx) => (
          <MethodPackCard
            key={pack.id}
            id={pack.id}
            nameKo={pack.nameKo}
            tier={pack.tier}
            category={pack.category}
            quickRun={pack.quickRun === 1}
            timebox={pack.timebox}
            whenToUse={pack.whenToUse}
            evidenceMinimum={pack.evidenceMinimum}
            delay={idx * 60}
            onClick={() => handleCardClick(pack as MethodPack)}
          />
        ))}
      </div>

      {filteredPacks.length === 0 && (
        <p className="mt-8 text-center text-sm text-[var(--axis-text-tertiary)]">
          해당 티어에 등록된 방법론이 없습니다.
        </p>
      )}

      {/* Detail Dialog */}
      <MethodPackDetailDialog
        pack={selectedPack}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </PageLayout>
  );
}
