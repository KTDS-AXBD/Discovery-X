import { useState, useEffect, useRef, useMemo } from "react";

interface GraphNode {
  id: string;
  label: string;
  ontologyTypeId: string | null;
  sourceEvidenceId: string | null;
  metadata: Record<string, unknown> | null;
}

interface GraphEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relationType: string;
  strength: number;
  sourceEvidenceId: string | null;
}

interface OntologyType {
  id: string;
  nameKo: string;
  domain: string;
  icon: string | null;
  color: string;
}

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GraphViewerProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  ontologyTypes: OntologyType[];
  onNodeClick?: (nodeId: string) => void;
}

const EDGE_STYLES: Record<string, { stroke: string; dasharray: string }> = {
  supports: { stroke: "var(--axis-badge-success-text)", dasharray: "" },
  contradicts: { stroke: "var(--axis-button-destructive-bg-default)", dasharray: "5,5" },
  causes: { stroke: "var(--axis-badge-purple-text)", dasharray: "" },
  relates_to: { stroke: "var(--axis-text-tertiary)", dasharray: "3,3" },
  depends_on: { stroke: "var(--axis-badge-info-text)", dasharray: "8,4" },
};

const NODE_RADIUS = 28;
const WIDTH = 800;
const HEIGHT = 600;

export function GraphViewer({ nodes, edges, ontologyTypes, onNodeClick }: GraphViewerProps) {
  const initialNodes = useMemo(() => {
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;
    // Deterministic jitter based on index to avoid Math.random in render
    const jitter = (i: number, seed: number) => ((((i * 2654435761 + seed) >>> 0) % 1000) / 1000 - 0.5) * 40;
    return nodes.map((n, i) => ({
      ...n,
      x: cx + (Math.cos((2 * Math.PI * i) / Math.max(1, nodes.length)) * 200) + jitter(i, 1),
      y: cy + (Math.sin((2 * Math.PI * i) / Math.max(1, nodes.length)) * 200) + jitter(i, 2),
      vx: 0,
      vy: 0,
    }));
  }, [nodes]);

  const [simNodes, setSimNodes] = useState<SimNode[]>(initialNodes);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const animRef = useRef<number>(0);
  const iterRef = useRef(0);

  const typeMap = new Map(ontologyTypes.map((t) => [t.id, t]));

  // Keep refs in sync
  const edgesRef = useRef(edges);
  const initialNodesRef = useRef(initialNodes);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // Reset when nodes change
  useEffect(() => {
    if (initialNodesRef.current !== initialNodes) {
      initialNodesRef.current = initialNodes;
      iterRef.current = 0;
    }
  }, [initialNodes]);

  useEffect(() => {
    const tick = () => {
      if (iterRef.current > 150) return;
      iterRef.current++;

      setSimNodes((prev) => {
        const next = prev.map((n) => ({ ...n }));
        const nm = new Map(next.map((n) => [n.id, n]));
        const alpha = Math.max(0.01, 0.3 * Math.pow(0.95, iterRef.current));

        // Repulsion between nodes
        for (let i = 0; i < next.length; i++) {
          for (let j = i + 1; j < next.length; j++) {
            const dx = next[j].x - next[i].x;
            const dy = next[j].y - next[i].y;
            const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
            const force = (800 / (dist * dist)) * alpha;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            next[i].vx -= fx;
            next[i].vy -= fy;
            next[j].vx += fx;
            next[j].vy += fy;
          }
        }

        // Attraction along edges
        for (const edge of edgesRef.current) {
          const from = nm.get(edge.fromNodeId);
          const to = nm.get(edge.toNodeId);
          if (!from || !to) continue;
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          const target = 120;
          const force = ((dist - target) * 0.02) * alpha;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          from.vx += fx;
          from.vy += fy;
          to.vx -= fx;
          to.vy -= fy;
        }

        // Center gravity
        for (const n of next) {
          n.vx += (WIDTH / 2 - n.x) * 0.005 * alpha;
          n.vy += (HEIGHT / 2 - n.y) * 0.005 * alpha;
          n.vx *= 0.8;
          n.vy *= 0.8;
          n.x += n.vx;
          n.y += n.vy;
          n.x = Math.max(NODE_RADIUS, Math.min(WIDTH - NODE_RADIUS, n.x));
          n.y = Math.max(NODE_RADIUS, Math.min(HEIGHT - NODE_RADIUS, n.y));
        }

        return next;
      });

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [nodes]);

  const filteredNodes = typeFilter.size === 0
    ? simNodes
    : simNodes.filter((n) => n.ontologyTypeId && typeFilter.has(n.ontologyTypeId));

  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = edges.filter(
    (e) => filteredNodeIds.has(e.fromNodeId) && filteredNodeIds.has(e.toNodeId)
  );

  const nodeMap = new Map(simNodes.map((n) => [n.id, n]));
  const selectedNodeData = selectedNode ? nodeMap.get(selectedNode) : null;
  const connectedEdges = selectedNode
    ? edges.filter((e) => e.fromNodeId === selectedNode || e.toNodeId === selectedNode)
    : [];

  const toggleFilter = (typeId: string) => {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(typeId)) {
        next.delete(typeId);
      } else {
        next.add(typeId);
      }
      return next;
    });
  };

  if (nodes.length === 0) {
    return (
      <div className="flex h-96 items-center justify-center rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-default)]">
        <p className="text-sm text-[var(--axis-text-tertiary)]">
          맥락 그래프가 비어 있습니다. Agent에게 엔티티 추출을 요청하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-4">
      {/* Filter panel */}
      <div className="w-48 shrink-0 space-y-2">
        <h3 className="text-xs font-semibold uppercase text-[var(--axis-text-tertiary)]">필터</h3>
        {ontologyTypes.map((t) => (
          <label key={t.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={typeFilter.size === 0 || typeFilter.has(t.id)}
              onChange={() => toggleFilter(t.id)}
              className="rounded"
            />
            <span style={{ color: t.color }}>{t.icon}</span>
            <span className="text-[var(--axis-text-secondary)]">{t.nameKo}</span>
          </label>
        ))}
      </div>

      {/* SVG graph */}
      <div className="flex-1 overflow-hidden rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-default)]">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full w-full">
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6 Z" fill="var(--axis-text-tertiary)" />
            </marker>
          </defs>

          {/* Edges */}
          {filteredEdges.map((edge) => {
            const from = nodeMap.get(edge.fromNodeId);
            const to = nodeMap.get(edge.toNodeId);
            if (!from || !to) return null;
            const style = EDGE_STYLES[edge.relationType] || EDGE_STYLES.relates_to;
            const isHighlighted = hoveredNode === edge.fromNodeId || hoveredNode === edge.toNodeId;
            return (
              <line
                key={edge.id}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={style.stroke}
                strokeWidth={isHighlighted ? 2.5 : 1.5}
                strokeDasharray={style.dasharray}
                opacity={isHighlighted ? 1 : 0.6}
                markerEnd="url(#arrow)"
              />
            );
          })}

          {/* Nodes */}
          {filteredNodes.map((node) => {
            const ontType = node.ontologyTypeId ? typeMap.get(node.ontologyTypeId) : null;
            const color = ontType?.color || "#6B7280";
            const isHovered = hoveredNode === node.id;
            const isSelected = selectedNode === node.id;
            return (
              <g
                key={node.id}
                transform={`translate(${node.x},${node.y})`}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => {
                  setSelectedNode(node.id === selectedNode ? null : node.id);
                  onNodeClick?.(node.id);
                }}
                className="cursor-pointer"
              >
                <circle
                  r={NODE_RADIUS}
                  fill={color}
                  opacity={isHovered || isSelected ? 1 : 0.8}
                  stroke={isSelected ? "var(--axis-border-focus)" : "none"}
                  strokeWidth={isSelected ? 3 : 0}
                />
                <text
                  textAnchor="middle"
                  dy="-2"
                  fill="white"
                  fontSize="10"
                  fontWeight="600"
                >
                  {ontType?.icon || ""}
                </text>
                <text
                  textAnchor="middle"
                  dy="12"
                  fill="white"
                  fontSize="8"
                >
                  {node.label.length > 8 ? node.label.slice(0, 7) + "…" : node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Detail panel */}
      {selectedNodeData && (
        <div className="w-56 shrink-0 space-y-3 rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-default)] p-4">
          <h3 className="text-sm font-semibold text-[var(--axis-text-primary)]">{selectedNodeData.label}</h3>
          {selectedNodeData.ontologyTypeId && (
            <p className="text-xs text-[var(--axis-text-tertiary)]">
              {typeMap.get(selectedNodeData.ontologyTypeId)?.nameKo}
            </p>
          )}
          {connectedEdges.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-[var(--axis-text-tertiary)]">관계 ({connectedEdges.length})</h4>
              <ul className="mt-1 space-y-1">
                {connectedEdges.map((e) => {
                  const other = e.fromNodeId === selectedNode
                    ? nodeMap.get(e.toNodeId)
                    : nodeMap.get(e.fromNodeId);
                  return (
                    <li key={e.id} className="text-xs text-[var(--axis-text-secondary)]">
                      {e.relationType} → {other?.label || "?"}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
