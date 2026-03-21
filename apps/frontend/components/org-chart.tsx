"use client";

import { useMemo } from "react";
import { Background, Controls, MarkerType, MiniMap, ReactFlow, type Edge as FlowEdge, type Node as FlowNode } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

interface Node {
  id: string;
  label: string;
  role: string;
}

interface Edge {
  from: string;
  to: string;
}

interface Props {
  nodes: Node[];
  edges: Edge[];
}

function buildLevels(nodes: Node[], edges: Edge[]): Map<string, number> {
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

export function OrgChart({ nodes, edges }: Props): React.JSX.Element {
  const { flowNodes, flowEdges } = useMemo(() => {
    const levels = buildLevels(nodes, edges);
    const grouped = new Map<number, Node[]>();

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
              <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
                <p className="text-sm font-medium text-slate-100">{node.label}</p>
                <p className="text-xs text-cyan-300">{node.role}</p>
              </div>
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

  return (
    <section className="card mt-6">
      <h2 className="text-xl font-semibold">Organigramma dinamico</h2>
      <div className="mt-4 h-[460px] rounded-lg border border-slate-700">
        <ReactFlow nodes={flowNodes} edges={flowEdges} fitView proOptions={{ hideAttribution: true }}>
          <MiniMap />
          <Controls />
          <Background />
        </ReactFlow>
      </div>
      <p className="mt-4 text-xs text-slate-500">Dipendenze gerarchiche: {edges.length}</p>
    </section>
  );
}
