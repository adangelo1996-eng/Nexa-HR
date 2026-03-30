"use client";

import { useCallback, useMemo } from "react";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeMouseHandler
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

export interface OrgChartNode {
  id: string;
  label: string;
  role: string;
  costCenterId?: string;
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
}

function buildLevels(nodes: OrgChartNode[], edges: OrgChartEdge[]): Map<string, number> {
  const incoming = new Map<string, number>();
  const children = new Map<string, string[]>();
  nodes.forEach((node) => {
    incoming.set(node.id, 0);
    children.set(node.id, []);
  });
  edges.forEach((edge) => {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    children.get(edge.from)?.push(edge.to);
  });

  const queue: string[] = nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0).map((node) => node.id);
  const levels = new Map<string, number>();
  queue.forEach((id) => levels.set(id, 0));

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentLevel = levels.get(currentId) ?? 0;
    for (const childId of children.get(currentId) ?? []) {
      const next = currentLevel + 1;
      if (!levels.has(childId) || (levels.get(childId) ?? 0) < next) {
        levels.set(childId, next);
      }
      incoming.set(childId, (incoming.get(childId) ?? 1) - 1);
      if ((incoming.get(childId) ?? 0) <= 0) {
        queue.push(childId);
      }
    }
  }

  nodes.forEach((node) => {
    if (!levels.has(node.id)) {
      levels.set(node.id, 0);
    }
  });
  return levels;
}

export function OrgChart({
  nodes,
  edges,
  framed = true,
  onNodeSelect,
  heightClass = "h-[460px]"
}: Props): React.JSX.Element {
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const { flowNodes, flowEdges } = useMemo(() => {
    const levels = buildLevels(nodes, edges);
    const grouped = new Map<number, OrgChartNode[]>();

    nodes.forEach((node) => {
      const level = levels.get(node.id) ?? 0;
      const levelNodes = grouped.get(level) ?? [];
      levelNodes.push(node);
      grouped.set(level, levelNodes);
    });

    const sortedLevels = [...grouped.keys()].sort((a, b) => a - b);
    const flowNodesResult: FlowNode[] = [];
    for (const level of sortedLevels) {
      const levelNodes = grouped.get(level) ?? [];
      levelNodes.forEach((node, index) => {
        flowNodesResult.push({
          id: node.id,
          position: { x: index * 260, y: level * 140 },
          data: {
            label: (
              <button
                type="button"
                className="w-full cursor-pointer rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_95%,transparent)] px-3 py-2 text-left transition-opacity hover:opacity-90"
                onClick={(e) => {
                  e.stopPropagation();
                  onNodeSelect?.(node);
                }}
              >
                <p className="text-sm font-medium text-[var(--prom-text)]">{node.label}</p>
                <p className="text-xs text-[var(--prom-gold)]">{node.role}</p>
              </button>
            )
          },
          draggable: false
        });
      });
    }

    const flowEdgesResult: FlowEdge[] = edges.map((edge) => ({
      id: `${edge.from}-${edge.to}`,
      source: edge.from,
      target: edge.to,
      markerEnd: { type: MarkerType.ArrowClosed }
    }));

    return { flowNodes: flowNodesResult, flowEdges: flowEdgesResult };
  }, [nodes, edges]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      const n = nodeById.get(node.id);
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
        fitView
        proOptions={{ hideAttribution: true }}
        onNodeClick={onNodeSelect ? onNodeClick : undefined}
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
      <p className="mt-4 text-xs text-[var(--prom-muted)]">Collegamenti: {edges.length}</p>
    </section>
  );
}
