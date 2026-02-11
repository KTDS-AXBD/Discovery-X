import { Card, CardContent } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";

interface InsightPanelProps {
  type: "patterns" | "contradictions" | "clusters" | "centrality";
  data: unknown;
  loading?: boolean;
}

interface PatternItem {
  path: string[];
  frequency: number;
  description?: string;
}

interface ContradictionItem {
  nodeA: string;
  nodeB: string;
  supports: number;
  contradicts: number;
  description?: string;
}

interface ClusterItem {
  nodes: string[];
  density: number;
  label?: string;
}

interface CentralityItem {
  nodeId: string;
  label: string;
  degree: number;
  betweenness?: number;
}

const TYPE_LABELS: Record<InsightPanelProps["type"], { title: string; icon: string }> = {
  patterns: { title: "패턴 감지", icon: "🔗" },
  contradictions: { title: "모순 감지", icon: "⚡" },
  clusters: { title: "클러스터", icon: "🔵" },
  centrality: { title: "중심성", icon: "🎯" },
};

function PatternCard({ item }: { item: PatternItem }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--axis-text-primary)]">
            {item.path.join(" → ")}
          </span>
          <Badge variant="secondary" className="text-[10px]">
            {item.frequency}회
          </Badge>
        </div>
        {item.description && (
          <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">{item.description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ContradictionCard({ item }: { item: ContradictionItem }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-[var(--axis-text-primary)]">{item.nodeA}</span>
          <span className="text-[var(--axis-text-tertiary)]">↔</span>
          <span className="font-medium text-[var(--axis-text-primary)]">{item.nodeB}</span>
        </div>
        <div className="mt-1 flex gap-2 text-[10px]">
          <Badge variant="success">{item.supports} 지지</Badge>
          <Badge variant="destructive">{item.contradicts} 모순</Badge>
        </div>
        {item.description && (
          <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">{item.description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ClusterCard({ item }: { item: ClusterItem }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          {item.label && (
            <span className="text-sm font-medium text-[var(--axis-text-primary)]">{item.label}</span>
          )}
          <Badge variant="secondary" className="text-[10px]">
            {item.nodes.length}개 노드
          </Badge>
          <Badge variant="info" className="text-[10px]">
            밀도 {(item.density * 100).toFixed(0)}%
          </Badge>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {item.nodes.slice(0, 8).map((node) => (
            <span
              key={node}
              className="rounded bg-[var(--axis-surface-secondary)] px-1.5 py-0.5 text-[10px] text-[var(--axis-text-secondary)]"
            >
              {node}
            </span>
          ))}
          {item.nodes.length > 8 && (
            <span className="text-[10px] text-[var(--axis-text-tertiary)]">
              +{item.nodes.length - 8}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CentralityCard({ item }: { item: CentralityItem }) {
  const maxWidth = 100;
  const barWidth = Math.min(maxWidth, item.degree * 10);

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[var(--axis-text-primary)]">{item.label}</span>
          <Badge variant="secondary" className="text-[10px]">
            degree {item.degree}
          </Badge>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-[var(--axis-surface-secondary)]">
          <div
            className="h-full rounded-full bg-[var(--axis-surface-brand)]"
            style={{ width: `${barWidth}%` }}
          />
        </div>
        {item.betweenness !== undefined && (
          <p className="mt-1 text-[10px] text-[var(--axis-text-tertiary)]">
            betweenness: {item.betweenness.toFixed(3)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function InsightPanel({ type, data, loading }: InsightPanelProps) {
  const { title, icon } = TYPE_LABELS[type];

  if (loading) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[var(--axis-text-secondary)]">
          {icon} {title}
        </h3>
        <div className="flex h-32 items-center justify-center rounded-lg border border-[var(--axis-border-default)]">
          <p className="text-sm text-[var(--axis-text-tertiary)]">분석 중...</p>
        </div>
      </div>
    );
  }

  if (!data || (Array.isArray(data) && data.length === 0)) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[var(--axis-text-secondary)]">
          {icon} {title}
        </h3>
        <p className="text-sm text-[var(--axis-text-tertiary)]">결과가 없습니다.</p>
      </div>
    );
  }

  const items = Array.isArray(data) ? data : [data];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-[var(--axis-text-secondary)]">
        {icon} {title}
        <Badge variant="secondary" className="ml-2 text-[10px]">
          {items.length}건
        </Badge>
      </h3>
      <div className="space-y-2">
        {type === "patterns" &&
          items.map((item, i) => <PatternCard key={i} item={item as PatternItem} />)}
        {type === "contradictions" &&
          items.map((item, i) => <ContradictionCard key={i} item={item as ContradictionItem} />)}
        {type === "clusters" &&
          items.map((item, i) => <ClusterCard key={i} item={item as ClusterItem} />)}
        {type === "centrality" &&
          items.map((item, i) => <CentralityCard key={i} item={item as CentralityItem} />)}
      </div>
    </div>
  );
}
