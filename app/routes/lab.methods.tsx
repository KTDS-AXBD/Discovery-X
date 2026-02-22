import { useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import type { MethodPack } from "~/db/schema";
import { getDb } from "~/db";
import { LabService } from "~/lib/services";
import { MethodPackCard } from "~/components/methods/MethodPackCard";
import { MethodPackDetailDialog } from "~/components/methods/MethodPackDetailDialog";

export async function loader({ context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const service = new LabService(db);
  const allPacks = await service.getMethodPacks();
  return json({ packs: allPacks });
}

const TIERS = [
  { value: "Tier-0", label: "Tier-0", desc: "필수" },
  { value: "Tier-1", label: "Tier-1", desc: "권장" },
  { value: "Tier-2", label: "Tier-2", desc: "선택" },
];

export default function LabMethodsPage() {
  const { packs } = useLoaderData<typeof loader>();
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

  return (
    <div>
      {/* Section header */}
      <div className="mb-5">
        <h2
          className="text-sm font-semibold uppercase tracking-wider text-lab-accent"
          style={{ fontFamily: "var(--dx-font-mono)" }}
        >
          Method Pack Library
        </h2>
        <p className="mt-1 text-xs text-fg-tertiary">
          12종 방법론 팩 — 단계별 실험 도구. 각 Discovery 상태에 맞는 방법론을 선택하세요.
        </p>
      </div>

      {/* Tier filter */}
      <div className="mb-5 flex items-center gap-2">
        <span
          className="mr-1 text-[10px] uppercase tracking-widest text-fg-tertiary"
          style={{ fontFamily: "var(--dx-font-mono)" }}
        >
          Filter
        </span>
        <button
          className={`rounded px-2.5 py-1 text-[11px] font-medium tracking-wide transition-colors ${
            !tierFilter
              ? "bg-lab-accent text-white"
              : "border border-line-subtle text-fg-tertiary hover:text-fg-secondary"
          }`}
          style={{ fontFamily: "var(--dx-font-mono)" }}
          onClick={() => setSearchParams({})}
        >
          ALL ({packs.length})
        </button>
        {TIERS.map((tier) => {
          const count = packs.filter((p) => p.tier === tier.value).length;
          return (
            <button
              key={tier.value}
              className={`rounded px-2.5 py-1 text-[11px] font-medium tracking-wide transition-colors ${
                tierFilter === tier.value
                  ? "bg-lab-accent text-white"
                  : "border border-line-subtle text-fg-tertiary hover:text-fg-secondary"
              }`}
              style={{ fontFamily: "var(--dx-font-mono)" }}
              onClick={() => setSearchParams({ tier: tier.value })}
            >
              {tier.label} ({count})
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
        <div className="mt-12 flex flex-col items-center justify-center text-center">
          <div
            className="rounded-full border border-line-subtle p-3"
          >
            <svg className="h-6 w-6 text-fg-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
            </svg>
          </div>
          <p
            className="mt-3 text-xs uppercase tracking-wider text-fg-tertiary"
            style={{ fontFamily: "var(--dx-font-mono)" }}
          >
            No packs found
          </p>
          <p className="mt-1 text-xs text-fg-tertiary">
            해당 티어에 등록된 방법론이 없습니다.
          </p>
        </div>
      )}

      {/* Detail Dialog */}
      <MethodPackDetailDialog
        pack={selectedPack}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
