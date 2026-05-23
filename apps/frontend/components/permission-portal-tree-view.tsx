"use client";

import type { Route } from "next";
import Link from "next/link";
import type { JSX, ReactNode } from "react";
import {
  buildNexaPermissionPortalTree,
  hrefsForResourceKey,
  type PermissionPortalMacro,
  type PermissionPortalSubgroup,
  type PermissionResourceGroup
} from "@/lib/permission-portal-groups";
import type { PermissionDefinition } from "@/lib/api";
import { resourceVisible } from "@/lib/permission-effective";
import {
  portalCategoryGlassColumnHeaderClass,
  portalCategoryTileTopAccentClass,
  portalSubgroupGlassClass
} from "@/lib/nav-visual-accents";

const RESOURCE_FOOTNOTE: Partial<Record<string, string>> = {
  ai_assistant_scope_managed:
    "In HEBB AI for HR consente di scegliere una persona tra i riporti o un team di cui sei responsabile.",
  ai_assistant_scope_org:
    "In HEBB AI for HR consente ricerca su tutta l’organizzazione (persona, team, centro di costo)."
};

export type PermissionPortalTreeViewProps = {
  nexaDefs: PermissionDefinition[];
  /** Permessi effettivi (catalogo espanso). */
  grantedIds: Set<string>;
  /** Solo macro-sezioni con almeno un permesso attivo. */
  onlyGranted?: boolean;
  /** Contenuto custom per ogni risorsa (checkbox admin o badge read-only). */
  renderResourceControls: (group: PermissionResourceGroup, granted: Set<string>) => ReactNode;
  renderMacroActions?: (macro: PermissionPortalMacro) => ReactNode;
  renderSubgroupActions?: (sg: PermissionPortalSubgroup, portalCategory: string) => ReactNode;
  intro?: ReactNode;
};

export function PermissionPortalTreeView(props: PermissionPortalTreeViewProps): JSX.Element {
  const {
    nexaDefs,
    grantedIds,
    onlyGranted = false,
    renderResourceControls,
    renderMacroActions,
    renderSubgroupActions,
    intro
  } = props;
  const tree = buildNexaPermissionPortalTree(nexaDefs).map((macro) => ({
    ...macro,
    subgroups: macro.subgroups
      .map((sg) => ({
        ...sg,
        resources: sg.resources.filter((r) =>
          onlyGranted ? resourceVisible(grantedIds, r.read?.id, r.write?.id) : true
        )
      }))
      .filter((sg) => sg.resources.length > 0)
  })).filter((m) => m.subgroups.length > 0);

  return (
    <div className="space-y-4">
      {intro}
      {tree.map((macro) => (
        <MacroSection
          key={macro.portalCategory}
          macro={macro}
          grantedIds={grantedIds}
          renderResourceControls={renderResourceControls}
          renderMacroActions={renderMacroActions}
          renderSubgroupActions={renderSubgroupActions}
        />
      ))}
      {tree.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--prom-line)] px-4 py-6 text-center text-sm text-[var(--prom-muted)]">
          Nessun permesso Nexa HR assegnato per questo profilo.
        </p>
      ) : null}
    </div>
  );
}

function MacroSection(props: {
  macro: PermissionPortalMacro;
  grantedIds: Set<string>;
  renderResourceControls: PermissionPortalTreeViewProps["renderResourceControls"];
  renderMacroActions?: PermissionPortalTreeViewProps["renderMacroActions"];
  renderSubgroupActions?: PermissionPortalTreeViewProps["renderSubgroupActions"];
}): JSX.Element {
  const { macro, grantedIds, renderResourceControls, renderMacroActions, renderSubgroupActions } = props;
  const accent = macro.portalCategory;

  return (
    <details
      open
      className={`overflow-hidden rounded-2xl border border-[var(--prom-line)] bg-[var(--card-bg)] shadow-[var(--card-shadow)] ${portalCategoryTileTopAccentClass(accent)}`}
    >
      <summary className="cursor-pointer list-none px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className={portalCategoryGlassColumnHeaderClass(accent, "compact")}>{macro.portalCategory}</div>
          {renderMacroActions ? (
            <span
              className="shrink-0"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {renderMacroActions(macro)}
            </span>
          ) : null}
        </div>
      </summary>
      <div className="space-y-3 border-t border-[var(--prom-line)] px-3 pb-3 pt-2">
        {macro.subgroups.map((sg) => (
          <SubgroupBlock
            key={sg.id}
            sg={sg}
            portalCategory={accent}
            grantedIds={grantedIds}
            renderResourceControls={renderResourceControls}
            renderSubgroupActions={renderSubgroupActions}
          />
        ))}
      </div>
    </details>
  );
}

function SubgroupBlock(props: {
  sg: PermissionPortalSubgroup;
  portalCategory: string;
  grantedIds: Set<string>;
  renderResourceControls: PermissionPortalTreeViewProps["renderResourceControls"];
  renderSubgroupActions?: PermissionPortalTreeViewProps["renderSubgroupActions"];
}): JSX.Element {
  const { sg, portalCategory, grantedIds, renderResourceControls, renderSubgroupActions } = props;

  return (
    <div className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_55%,transparent)] p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={portalSubgroupGlassClass(portalCategory, "compact")}>{sg.title}</p>
        {renderSubgroupActions ? renderSubgroupActions(sg, portalCategory) : null}
      </div>
      <div className="mt-2 space-y-2">
        {sg.resources.map((g) => (
          <ResourceCollapsible
            key={g.resourceKey}
            group={g}
            grantedIds={grantedIds}
            renderResourceControls={renderResourceControls}
          />
        ))}
      </div>
    </div>
  );
}

function ResourceCollapsible(props: {
  group: PermissionResourceGroup;
  grantedIds: Set<string>;
  renderResourceControls: PermissionPortalTreeViewProps["renderResourceControls"];
}): JSX.Element {
  const { group: g, grantedIds, renderResourceControls } = props;
  const hrefs = hrefsForResourceKey(g.resourceKey);
  const visible = resourceVisible(grantedIds, g.read?.id, g.write?.id);

  return (
    <details
      className="rounded-lg border border-[var(--prom-line)] bg-[var(--card-bg)]"
      open={visible}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-2.5 py-2 [&::-webkit-details-marker]:hidden">
        <span className="text-xs font-semibold text-[var(--prom-text)]">{g.labelIt}</span>
        <span className="shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {renderResourceControls(g, grantedIds)}
        </span>
      </summary>
      <div className="space-y-2 border-t border-[var(--prom-line)] px-2.5 pb-2.5 pt-2">
        <p className="text-[10px] leading-snug text-[var(--prom-muted)]">
          {g.write && grantedIds.has(g.write.id)
            ? g.write.descriptionWriteIt
            : g.read?.descriptionReadIt}
        </p>
        {hrefs.length > 0 ? (
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--prom-muted)]">
              Pagine nel portale
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {hrefs.map((href) => (
                <li key={String(href)}>
                  <Link
                    href={href as Route}
                    className="inline-block rounded-md border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] px-2 py-0.5 text-[10px] text-[var(--prom-text)] hover:border-[color-mix(in_srgb,#002D72_35%,var(--prom-line))]"
                  >
                    {href}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {RESOURCE_FOOTNOTE[g.resourceKey] ? (
          <p className="border-t border-[var(--prom-line)] pt-2 text-[10px] text-[var(--prom-muted)]">
            {RESOURCE_FOOTNOTE[g.resourceKey]}
          </p>
        ) : null}
      </div>
    </details>
  );
}
