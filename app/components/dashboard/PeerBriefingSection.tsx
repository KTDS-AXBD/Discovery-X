import { useState } from "react";
import { Link } from "@remix-run/react";
import { cn } from "~/lib/utils/cn";

interface PeerBriefingSectionProps {
  ideas: { id: string; title: string; status: string }[];
  proposals: { id: string; title: string; status: string }[];
}

const TABS = [
  { key: "ideas", label: (count: number) => `아이디어 (${count})` },
  { key: "proposals", label: (count: number) => `사업 제안 (${count})` },
  { key: "consulting", label: () => "컨설팅 (0)" },
  { key: "verification", label: () => "검증 ox / 동료 (0)" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function PeerBriefingSection({ ideas, proposals }: PeerBriefingSectionProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("ideas");

  const getTabCount = (key: TabKey): number => {
    switch (key) {
      case "ideas":
        return ideas.length;
      case "proposals":
        return proposals.length;
      default:
        return 0;
    }
  };

  return (
    <section className="mt-8">
      <h2 className="mb-4 text-lg font-semibold text-[var(--axis-text-primary)]">
        피어브리핑
      </h2>

      {/* Tab bar */}
      <div className="flex gap-4 border-b border-[var(--axis-border-default)]">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "pb-2 text-sm font-medium transition-colors",
              activeTab === tab.key
                ? "border-b-2 border-[var(--axis-text-brand)] text-[var(--axis-text-brand)]"
                : "text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-primary)]"
            )}
          >
            {tab.label(getTabCount(tab.key))}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mt-4">
        {activeTab === "ideas" && (
          <TabContent
            items={ideas}
            linkPrefix="/ideas"
            emptyMessage="아직 항목이 없습니다."
          />
        )}
        {activeTab === "proposals" && (
          <TabContent
            items={proposals}
            linkPrefix="/proposals"
            emptyMessage="아직 항목이 없습니다."
          />
        )}
        {activeTab === "consulting" && (
          <p className="py-4 text-sm text-[var(--axis-text-tertiary)]">
            아직 항목이 없습니다.
          </p>
        )}
        {activeTab === "verification" && (
          <p className="py-4 text-sm text-[var(--axis-text-tertiary)]">
            아직 항목이 없습니다.
          </p>
        )}
      </div>
    </section>
  );
}

function TabContent({
  items,
  linkPrefix,
  emptyMessage,
}: {
  items: { id: string; title: string; status: string }[];
  linkPrefix: string;
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return (
      <p className="py-4 text-sm text-[var(--axis-text-tertiary)]">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-1">
      {items.map((item) => (
        <Link
          key={item.id}
          to={`${linkPrefix}/${item.id}`}
          className="truncate text-sm text-[var(--axis-text-primary)] hover:underline"
        >
          {item.title}
        </Link>
      ))}
    </div>
  );
}
