"use client";

import { useCallback, useMemo } from "react";
import dagre from "dagre";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeMouseHandler,
  type NodeProps
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

export interface OrgChartNode {
  id: string;
  label: string;
  role: string;
  costCenterId?: string;
  roleName?: string;
  costCenterName?: string;
  email?: string;
  managerId?: string;
}

interface OrgChartEdge {
  from: string;
  to: string;
}

interface Props {
  nodes: OrgChartNode[];
  edges: OrgChartEdge[];
  /** Se true, mostra titolo e card container (dashboard legacy). */
  framed?: boolean;
  onNodeSelect?: (node: OrgChartNode) => void;
  heightClass?: string;
  /** Evidenzia il nodo dell’utente corrente nel grafo (bordo/oro). */
  highlightUserId?: string;
}

const CARD_W = 240;
const CARD_H = 104;

function initials(name: string): string {
  const p = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return p.map((x) => x[0]?.toUpperCase() ?? "").join("") || "?";
}

function EmployeeCardNode({ data, selected }: NodeProps): React.JSX.Element {
  const payload = data as {
    node: OrgChartNode;
    onSelect?: (n: OrgChartNode) => void;
    highlightUserId?: string;
  };
  const n = payload.node;
  const isMe = Boolean(payload.highlightUserId && payload.highlightUserId === n.id);
  const title = n.roleName ?? n.role;
  const sub = [n.costCenterName, n.email].filter(Boolean).join(" · ");
  return (
    <>
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-[var(--prom-gold)]" />
      <button
        type="button"
        className={`flex w-full min-w-[220px] max-w-[260px] cursor-pointer gap-3 rounded-xl border-2 px-3 py-2.5 text-left shadow-sm transition-[box-shadow,opacity,border-color] duration-200 ${
          isMe
            ? "border-[var(--prom-gold)] bg-[color-mix(in_srgb,var(--prom-gold)_14%,var(--prom-surface))] shadow-[0_0_0_3px_color-mix(in_srgb,var(--prom-gold)_28%,transparent)]"
            : selected
              ? "border-[color-mix(in_srgb,var(--prom-gold)_70%,transparent)] bg-[color-mix(in_srgb,var(--prom-surface)_96%,transparent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--prom-gold)_22%,transparent)]"
              : "border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_96%,transparent)] hover:border-[color-mix(in_srgb,var(--prom-gold)_45%,var(--prom-line))]"
        }`}
        onClick={(e) => {
          e.stopPropagation();
          payload.onSelect?.(n);
        }}
      >
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-[var(--prom-text)]"
          style={{ background: "color-mix(in_srgb, var(--prom-gold) 22%, transparent)" }}
          aria-hidden
        >
          {initials(n.label)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--prom-text)]">{n.label}</p>
          <p className="truncate text-xs font-medium text-[var(--prom-gold)]">{title}</p>
          {sub ? <p className="mt-0.5 truncate text-[10px] leading-tight text-[var(--prom-muted)]">{sub}</p> : null}
        </div>
      </button>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-[var(--prom-gold)]" />
    </>
  );
}

export function OrgChart({
  nodes,
  edges,
  framed = true,
  onNodeSelect,
  heightClass = "h-[min(70vh,560px)]",
  highlightUserId
}: Props): React.JSX.Element {
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const onSelectCb = useCallback(
    (n: OrgChartNode) => {
      onNodeSelect?.(n);
    },
    [onNodeSelect]
  );

  const nodeTypes = useMemo(() => ({ employeeCard: EmployeeCardNode }), []);

  const { flowNodes, flowEdges } = useMemo(() => {
    if (nodes.length === 0) {
      return { flowNodes: [] as FlowNode[], flowEdges: [] as FlowEdge[] };
    }
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
      rankdir: "TB",
      nodesep: 48,
      ranksep: 72,
      marginx: 24,
      marginy: 24
    });
    for (const n of nodes) {
      g.setNode(n.id, { width: CARD_W, height: CARD_H });
    }
    for (const e of edges) {
      if (nodes.some((n) => n.id === e.from) && nodes.some((n) => n.id === e.to)) {
        g.setEdge(e.from, e.to);
      }
    }
    dagre.layout(g);

    const flowNodesResult: FlowNode[] = nodes.map((node) => {
      const pos = g.node(node.id);
      const x = pos?.x != null ? pos.x - CARD_W / 2 : 0;
      const y = pos?.y != null ? pos.y - CARD_H / 2 : 0;
      return {
        id: node.id,
        type: "employeeCard",
        position: { x, y },
        data: { node, onSelect: onSelectCb, highlightUserId },
        draggable: false
      };
    });

    const flowEdgesResult: FlowEdge[] = edges.map((edge) => ({
      id: `${edge.from}-${edge.to}`,
      source: edge.from,
      target: edge.to,
      type: "smoothstep",
      style: { strokeWidth: 2, stroke: "var(--prom-line-strong)" },
      markerEnd: { type: MarkerType.ArrowClosed, color: "var(--prom-muted)" }
    }));

    return { flowNodes: flowNodesResult, flowEdges: flowEdgesResult };
  }, [nodes, edges, onSelectCb, highlightUserId]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, fn) => {
      const raw = fn.data as { node?: OrgChartNode } | undefined;
      const n = raw?.node ?? nodeById.get(fn.id);
      if (n) {
        onNodeSelect?.(n);
      }
    },
    [nodeById, onNodeSelect]
  );

  const flow = (
    <div className={`nexa-orgchart-flow ${heightClass} rounded-lg border border-[var(--prom-line)]`}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        onNodeClick={onNodeSelect ? onNodeClick : undefined}
        minZoom={0.2}
        maxZoom={1.4}
        defaultEdgeOptions={{ type: "smoothstep" }}
      >
        <MiniMap
          pannable
          zoomable
          maskColor="rgba(15, 23, 42, 0.45)"
          nodeStrokeWidth={2}
          className="nexa-flow-minimap"
        />
        <Controls className="nexa-flow-controls" showInteractive={false} />
        <Background />
      </ReactFlow>
    </div>
  );

  if (!framed) {
    return flow;
  }

  return (
    <section className="card mt-6">
      <h2 className="text-xl font-semibold text-[var(--prom-text)]">Organigramma</h2>
      {flow}
      <p className="mt-4 text-xs text-[var(--prom-muted)]">
        {edges.length} collegamenti verso il responsabile diretto
      </p>
    </section>
  );
}
