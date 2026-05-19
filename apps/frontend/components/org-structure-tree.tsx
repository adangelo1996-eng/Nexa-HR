"use client";

import type { OrgStructureTreeNode } from "@/lib/api";

export type OrgPersonClickContext = {
  costCenterId?: string;
  costCenterName?: string;
  teamName?: string;
};

function PersonRow({
  node,
  leadUserId,
  depth,
  onPersonClick,
  clickContext
}: {
  node: OrgStructureTreeNode;
  leadUserId?: string | null;
  depth: number;
  onPersonClick?: (node: OrgStructureTreeNode, context?: OrgPersonClickContext) => void;
  clickContext?: OrgPersonClickContext;
}): React.JSX.Element {
  const isLead = Boolean(leadUserId && node.id === leadUserId);
  const boxClass = [
    "w-full rounded-md border px-2 py-1.5 text-left text-[11px] leading-snug transition-colors",
    depth === 0
      ? "border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-gold)_14%,transparent)]"
      : "border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_70%,transparent)]",
    onPersonClick ? "cursor-pointer hover:border-[color-mix(in_srgb,#002D72_35%,var(--prom-line))]" : ""
  ].join(" ");

  const content = (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-medium text-[var(--prom-text)]">{node.fullName}</span>
        {isLead ? (
          <span className="rounded bg-[color-mix(in_srgb,var(--prom-gold)_35%,transparent)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--prom-text)]">
            Responsabile team
          </span>
        ) : null}
      </div>
      <PersonMetaLine node={node} onPersonClick={onPersonClick} />
    </>
  );

  return (
    <div className="space-y-1">
      {onPersonClick ? (
        <button type="button" className={boxClass} onClick={() => onPersonClick(node, clickContext)}>
          {content}
        </button>
      ) : (
        <div className={boxClass.replace("cursor-pointer hover:border-[color-mix(in_srgb,#002D72_35%,var(--prom-line))]", "")}>
          {content}
        </div>
      )}
      {node.reports?.length ? (
        <ul className="ml-2 space-y-1 border-l border-[var(--prom-line)] pl-2">
          {node.reports.map((r) => (
            <li key={r.id}>
              <PersonRow
                node={r}
                leadUserId={leadUserId}
                depth={depth + 1}
                onPersonClick={onPersonClick}
                clickContext={clickContext}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PersonMetaLine(props: {
  node: OrgStructureTreeNode;
  onPersonClick?: (node: OrgStructureTreeNode) => void;
}): React.JSX.Element {
  const { node, onPersonClick } = props;
  return (
    <div className="mt-0.5 text-[10px] text-[var(--prom-muted)]">
      {node.roleName ?? node.role}
      {node.email && !onPersonClick ? (
        <>
          {" · "}
          <a href={`mailto:${node.email}`} className="text-[var(--prom-gold)] underline-offset-2 hover:underline">
            {node.email}
          </a>
        </>
      ) : node.email ? (
        <>
          {" · "}
          <span>{node.email}</span>
        </>
      ) : null}
    </div>
  );
}

export function OrgStructureTeamTree({
  tree,
  leadUserId,
  onPersonClick,
  clickContext
}: {
  tree: OrgStructureTreeNode[];
  leadUserId?: string | null;
  onPersonClick?: (node: OrgStructureTreeNode, context?: OrgPersonClickContext) => void;
  clickContext?: OrgPersonClickContext;
}): React.JSX.Element {
  if (tree.length === 0) {
    return <p className="text-[11px] italic text-[var(--prom-muted)]">Nessun membro in questo team.</p>;
  }
  return (
    <div className="space-y-2">
      {tree.map((root) => (
        <PersonRow
          key={root.id}
          node={root}
          leadUserId={leadUserId}
          depth={0}
          onPersonClick={onPersonClick}
          clickContext={clickContext}
        />
      ))}
    </div>
  );
}
