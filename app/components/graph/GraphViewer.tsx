import { useState, useEffect, useRef, useMemo, useCallback } from "react";

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
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;

export function GraphViewer({ nodes, edges, ontologyTypes, onNodeClick }: GraphViewerProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const initialNodes = useMemo(() => {
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;
    const jitter = (i: number, seed: number) =>
      ((((i * 2654435761 + seed) >>> 0) % 1000) / 1000 - 0.5) * 40;
    return nodes.map((n, i) => ({
      ...n,
      x: cx + Math.cos((2 * Math.PI * i) / Math.max(1, nodes.length)) * 200 + jitter(i, 1),
      y: cy + Math.sin((2 * Math.PI * i) / Math.max(1, nodes.length)) * 200 + jitter(i, 2),
      vx: 0,
      vy: 0,
    }));
  }, [nodes]);

  const [simNodes, setSimNodes] = useState<SimNode[]>(initialNodes);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);

  const animRef = useRef<number>(0);
  const iterRef = useRef(0);
  const isRunningRef = useRef(false);
  const dragRef = useRef<string | null>(null);
  const panRef = useRef<{ cx: number; cy: number; tx: number; ty: number } | null>(null);
  const transformRef = useRef(transform);
  const didMoveRef = useRef(false);

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  const typeMap = new Map(ontologyTypes.map((t) => [t.id, t]));
  const edgesRef = useRef(edges);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // Detect nodes prop change → reset simNodes (render-time state derivation)
  const [prevNodes, setPrevNodes] = useState(nodes);
  if (prevNodes !== nodes) {
    setPrevNodes(nodes);
    setSimNodes(initialNodes);
  }

  // --- Force simulation ---
  const startSim = useCallback(() => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;

    const tick = () => {
      if (iterRef.current > 200 && !dragRef.current) {
        isRunningRef.current = false;
        return;
      }
      iterRef.current++;

      setSimNodes((prev) => {
        const next = prev.map((n) => ({ ...n }));
        const nm = new Map(next.map((n) => [n.id, n]));
        const alpha = Math.max(0.01, 0.3 * Math.pow(0.95, iterRef.current));
        const pinnedId = dragRef.current;

        // Repulsion between all nodes
        for (let i = 0; i < next.length; i++) {
          for (let j = i + 1; j < next.length; j++) {
            const dx = next[j].x - next[i].x;
            const dy = next[j].y - next[i].y;
            const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
            const force = (800 / (dist * dist)) * alpha;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            if (next[i].id !== pinnedId) {
              next[i].vx -= fx;
              next[i].vy -= fy;
            }
            if (next[j].id !== pinnedId) {
              next[j].vx += fx;
              next[j].vy += fy;
            }
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
          const force = (dist - 120) * 0.02 * alpha;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (from.id !== pinnedId) {
            from.vx += fx;
            from.vy += fy;
          }
          if (to.id !== pinnedId) {
            to.vx -= fx;
            to.vy -= fy;
          }
        }

        // Center gravity + velocity integration
        for (const n of next) {
          if (n.id === pinnedId) {
            n.vx = 0;
            n.vy = 0;
            continue;
          }
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
  }, []);

  // Initial simulation start
  useEffect(() => {
    iterRef.current = 0;
    isRunningRef.current = false;
    startSim();
    return () => {
      cancelAnimationFrame(animRef.current);
      isRunningRef.current = false;
    };
  }, [nodes, startSim]);

  const reheat = useCallback(
    (to = 50) => {
      iterRef.current = Math.min(iterRef.current, to);
      startSim();
    },
    [startSim],
  );

  // --- Node drag ---
  const handleNodePointerDown = useCallback(
    (e: React.PointerEvent, nodeId: string) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = nodeId;
      setDragNodeId(nodeId);
      didMoveRef.current = false;
      reheat(30);
    },
    [reheat],
  );

  // --- Background pan ---
  const handleBgPointerDown = useCallback((e: React.PointerEvent) => {
    if (dragRef.current) return;
    panRef.current = {
      cx: e.clientX,
      cy: e.clientY,
      tx: transformRef.current.x,
      ty: transformRef.current.y,
    };
    didMoveRef.current = false;
  }, []);

  // --- Global pointer listeners (document-level for drag/pan beyond SVG) ---
  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (dragRef.current) {
        didMoveRef.current = true;
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const t = transformRef.current;
        const svgX = ((e.clientX - rect.left) / rect.width) * WIDTH;
        const svgY = ((e.clientY - rect.top) / rect.height) * HEIGHT;
        const gx = (svgX - t.x) / t.k;
        const gy = (svgY - t.y) / t.k;
        const nid = dragRef.current;
        setSimNodes((prev) =>
          prev.map((n) => (n.id === nid ? { ...n, x: gx, y: gy, vx: 0, vy: 0 } : n)),
        );
        iterRef.current = Math.min(iterRef.current, 80);
        startSim();
        return;
      }
      if (panRef.current) {
        didMoveRef.current = true;
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const dx = ((e.clientX - panRef.current.cx) / rect.width) * WIDTH;
        const dy = ((e.clientY - panRef.current.cy) / rect.height) * HEIGHT;
        setTransform({
          x: panRef.current.tx + dx,
          y: panRef.current.ty + dy,
          k: transformRef.current.k,
        });
      }
    };

    const handleUp = () => {
      if (dragRef.current) {
        dragRef.current = null;
        setDragNodeId(null);
        iterRef.current = Math.min(iterRef.current, 100);
        startSim();
      }
      panRef.current = null;
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
    return () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
    };
  }, [startSim]);

  // --- Zoom (non-passive wheel for preventDefault) ---
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const svgX = ((e.clientX - rect.left) / rect.width) * WIDTH;
      const svgY = ((e.clientY - rect.top) / rect.height) * HEIGHT;
      const factor = e.deltaY < 0 ? 1.1 : 0.9;

      setTransform((prev) => {
        const newK = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev.k * factor));
        const ratio = newK / prev.k;
        return {
          k: newK,
          x: svgX - (svgX - prev.x) * ratio,
          y: svgY - (svgY - prev.y) * ratio,
        };
      });
    };

    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, []);

  // --- Zoom controls ---
  const zoomIn = useCallback(() => {
    setTransform((prev) => {
      const newK = Math.min(MAX_ZOOM, prev.k * 1.3);
      const ratio = newK / prev.k;
      const cx = WIDTH / 2;
      const cy = HEIGHT / 2;
      return { k: newK, x: cx - (cx - prev.x) * ratio, y: cy - (cy - prev.y) * ratio };
    });
  }, []);

  const zoomOut = useCallback(() => {
    setTransform((prev) => {
      const newK = Math.max(MIN_ZOOM, prev.k / 1.3);
      const ratio = newK / prev.k;
      const cx = WIDTH / 2;
      const cy = HEIGHT / 2;
      return { k: newK, x: cx - (cx - prev.x) * ratio, y: cy - (cy - prev.y) * ratio };
    });
  }, []);

  const resetView = useCallback(() => {
    setTransform({ x: 0, y: 0, k: 1 });
  }, []);

  // --- Filtering ---
  const filteredNodes =
    typeFilter.size === 0
      ? simNodes
      : simNodes.filter((n) => n.ontologyTypeId && typeFilter.has(n.ontologyTypeId));

  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = edges.filter(
    (e) => filteredNodeIds.has(e.fromNodeId) && filteredNodeIds.has(e.toNodeId),
  );

  const nodeMap = new Map(simNodes.map((n) => [n.id, n]));
  const selectedNodeData = selectedNode ? nodeMap.get(selectedNode) : null;
  const connectedEdges = selectedNode
    ? edges.filter((e) => e.fromNodeId === selectedNode || e.toNodeId === selectedNode)
    : [];

  const toggleFilter = (typeId: string) => {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(typeId)) next.delete(typeId);
      else next.add(typeId);
      return next;
    });
  };

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (didMoveRef.current) return;
      setSelectedNode((prev) => (prev === nodeId ? null : nodeId));
      onNodeClick?.(nodeId);
    },
    [onNodeClick],
  );

  if (nodes.length === 0) {
    return (
      <div className="flex h-96 items-center justify-center rounded-lg border border-line bg-surface">
        <p className="text-sm text-fg-tertiary">
          맥락 그래프가 비어 있습니다. Agent에게 엔티티 추출을 요청하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-4">
      {/* Filter panel */}
      <div className="w-48 shrink-0 space-y-2">
        <h3 className="text-xs font-semibold uppercase text-fg-tertiary">필터</h3>
        {ontologyTypes.map((t) => (
          <label key={t.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={typeFilter.size === 0 || typeFilter.has(t.id)}
              onChange={() => toggleFilter(t.id)}
              className="rounded"
            />
            <span style={{ color: t.color }}>{t.icon}</span>
            <span className="text-fg-secondary">{t.nameKo}</span>
          </label>
        ))}
      </div>

      {/* SVG graph */}
      <div className="relative flex-1 overflow-hidden rounded-lg border border-line bg-surface">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-full w-full select-none"
          style={{ cursor: dragNodeId ? "grabbing" : "grab", touchAction: "none" }}
          onPointerDown={handleBgPointerDown}
        >
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6 Z" fill="var(--axis-text-tertiary)" />
            </marker>
          </defs>

          {/* Zoom/Pan transform group */}
          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
            {/* Edges */}
            {filteredEdges.map((edge) => {
              const from = nodeMap.get(edge.fromNodeId);
              const to = nodeMap.get(edge.toNodeId);
              if (!from || !to) return null;
              const style = EDGE_STYLES[edge.relationType] || EDGE_STYLES.relates_to;
              const isHighlighted =
                hoveredNode === edge.fromNodeId || hoveredNode === edge.toNodeId;
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
              const isDragging = dragNodeId === node.id;
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x},${node.y})`}
                  onPointerDown={(e) => handleNodePointerDown(e, node.id)}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() => handleNodeClick(node.id)}
                  style={{ cursor: isDragging ? "grabbing" : "grab" }}
                >
                  {/* Drag glow ring */}
                  {isDragging && (
                    <circle
                      r={NODE_RADIUS + 5}
                      fill="none"
                      stroke="var(--dx-lab-accent)"
                      strokeWidth={2}
                      opacity={0.7}
                    />
                  )}
                  <circle
                    r={NODE_RADIUS}
                    fill={color}
                    opacity={isHovered || isSelected || isDragging ? 1 : 0.8}
                    stroke={isSelected ? "var(--axis-border-focus)" : "none"}
                    strokeWidth={isSelected ? 3 : 0}
                  />
                  <text
                    textAnchor="middle"
                    dy="-2"
                    fill="white"
                    fontSize="10"
                    fontWeight="600"
                    pointerEvents="none"
                  >
                    {ontType?.icon || ""}
                  </text>
                  <text
                    textAnchor="middle"
                    dy="12"
                    fill="white"
                    fontSize="8"
                    pointerEvents="none"
                  >
                    {node.label.length > 8 ? node.label.slice(0, 7) + "\u2026" : node.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Zoom controls overlay */}
        <div className="absolute right-2 top-2 flex flex-col gap-1">
          <button
            type="button"
            onClick={zoomIn}
            className="flex h-7 w-7 items-center justify-center rounded bg-surface-secondary text-sm text-fg-secondary shadow-sm hover:bg-surface-tertiary"
            title="확대"
          >
            +
          </button>
          <button
            type="button"
            onClick={zoomOut}
            className="flex h-7 w-7 items-center justify-center rounded bg-surface-secondary text-sm text-fg-secondary shadow-sm hover:bg-surface-tertiary"
            title="축소"
          >
            −
          </button>
          <button
            type="button"
            onClick={resetView}
            className="flex h-7 w-7 items-center justify-center rounded bg-surface-secondary text-[10px] text-fg-tertiary shadow-sm hover:bg-surface-tertiary"
            title="초기화"
            style={{ fontFamily: "var(--dx-font-mono)" }}
          >
            1:1
          </button>
        </div>

        {/* Zoom level indicator */}
        {transform.k !== 1 && (
          <span
            className="absolute bottom-2 right-2 rounded bg-surface-secondary px-1.5 py-0.5 text-[10px] tabular-nums text-fg-tertiary"
            style={{ fontFamily: "var(--dx-font-mono)" }}
          >
            {Math.round(transform.k * 100)}%
          </span>
        )}
      </div>

      {/* Detail panel */}
      {selectedNodeData && (
        <div className="w-56 shrink-0 space-y-3 rounded-lg border border-line bg-surface p-4">
          <h3 className="text-sm font-semibold text-fg">
            {selectedNodeData.label}
          </h3>
          {selectedNodeData.ontologyTypeId && (
            <p className="text-xs text-fg-tertiary">
              {typeMap.get(selectedNodeData.ontologyTypeId)?.nameKo}
            </p>
          )}
          {connectedEdges.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-fg-tertiary">
                관계 ({connectedEdges.length})
              </h4>
              <ul className="mt-1 space-y-1">
                {connectedEdges.map((e) => {
                  const other =
                    e.fromNodeId === selectedNode
                      ? nodeMap.get(e.toNodeId)
                      : nodeMap.get(e.fromNodeId);
                  return (
                    <li key={e.id} className="text-xs text-fg-secondary">
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
