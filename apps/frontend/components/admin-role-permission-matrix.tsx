"use client";

import type { JSX } from "react";
import type { PermissionDefinition } from "@/lib/api";
import {
  buildNexaPermissionPortalTree,
  permissionIdsInMacro,
  permissionIdsInSubgroup,
  permissionReadIdsInMacro,
  permissionReadIdsInSubgroup,
  type PermissionPortalMacro,
  type PermissionPortalSubgroup,
  type PermissionResourceGroup
} from "@/lib/permission-portal-groups";

const RESOURCE_FOOTNOTE: Partial<Record<string, string>> = {
  ai_assistant_scope_managed:
    "In Centro AI consente di scegliere una persona tra i riporti o un team di cui sei responsabile.",
  ai_assistant_scope_org:
    "In Centro AI consente ricerca su tutta l’organizzazione (persona, team, centro di costo)."
};

function hasReadEffective(set: Set<string>, readId: string | undefined, writeId: string | undefined): boolean {
  if (writeId && set.has(writeId)) return true;
  if (readId && set.has(readId)) return true;
  return false;
}

function hasWrite(set: Set<string>, writeId: string | undefined): boolean {
  return Boolean(writeId && set.has(writeId));
}

function resourceVisible(draft: Set<string>, readId?: string, writeId?: string): boolean {
  return hasReadEffective(draft, readId, writeId);
}

function macroReadOn(macro: PermissionPortalMacro, draft: Set<string>): boolean {
  for (const sg of macro.subgroups) {
    for (const r of sg.resources) {
      if (!resourceVisible(draft, r.read?.id, r.write?.id)) return false;
    }
  }
  return macro.subgroups.some((sg) => sg.resources.length > 0);
}

function subgroupReadOn(sg: PermissionPortalSubgroup, draft: Set<string>): boolean {
  if (sg.resources.length === 0) return false;
  return sg.resources.every((r) => resourceVisible(draft, r.read?.id, r.write?.id));
}

type AdminRolePermissionMatrixProps = {
  nexaDefs: PermissionDefinition[];
  draftPermissions: Set<string>;
  onChange: (next: Set<string>) => void;
};

export function AdminRolePermissionMatrix(props: AdminRolePermissionMatrixProps): JSX.Element {
  const { nexaDefs, draftPermissions, onChange } = props;
  const tree = buildNexaPermissionPortalTree(nexaDefs);

  function toggleRead(readId: string | undefined, writeId: string | undefined, checked: boolean): void {
    const next = new Set(draftPermissions);
    if (!checked) {
      if (readId) next.delete(readId);
      if (writeId) next.delete(writeId);
    } else if (!(writeId && next.has(writeId))) {
      if (readId) next.add(readId);
    }
    onChange(next);
  }

  function setWriteChecked(readId: string | undefined, writeId: string | undefined, checked: boolean, readOn: boolean): void {
    const next = new Set(draftPermissions);
    if (!writeId) {
      onChange(next);
      return;
    }
    if (checked) {
      next.add(writeId);
      if (readId) next.delete(readId);
    } else {
      next.delete(writeId);
      if (readId && readOn) next.add(readId);
    }
    onChange(next);
  }

  function setMacroRead(macro: PermissionPortalMacro, enabled: boolean): void {
    const next = new Set(draftPermissions);
    const ids = enabled ? permissionReadIdsInMacro(macro) : permissionIdsInMacro(macro);
    for (const id of ids) {
      if (enabled) {
        next.add(id);
      } else {
        next.delete(id);
      }
    }
    if (!enabled) {
      for (const id of permissionIdsInMacro(macro)) {
        next.delete(id);
      }
    }
    onChange(next);
  }

  function setSubgroupRead(sg: PermissionPortalSubgroup, enabled: boolean): void {
    const next = new Set(draftPermissions);
    if (enabled) {
      for (const id of permissionReadIdsInSubgroup(sg)) {
        next.add(id);
      }
    } else {
      for (const id of permissionIdsInSubgroup(sg)) {
        next.delete(id);
      }
    }
    onChange(next);
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
        Le macro-sezioni corrispondono alla <strong className="font-medium">Mappa del portale</strong>. «Mostra in
        portale» abilita la consultazione di tutte le voci della sezione; «Mostra sottosezione» limita a un gruppo di
        pagine. Per ogni area puoi poi distinguere solo lettura o anche modifica.
      </p>
      {tree.map((macro) => (
        <details
          key={macro.portalCategory}
          open
          className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_82%,transparent)] shadow-sm dark:border-slate-700 dark:bg-slate-900/30"
        >
          <summary className="cursor-pointer list-none px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">{macro.portalCategory}</span>
              <label
                className="flex cursor-pointer items-center gap-2 text-xs text-slate-700 dark:text-slate-200"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  className="rounded border-slate-400 text-amber-600 focus:ring-amber-500/40"
                  checked={macroReadOn(macro, draftPermissions)}
                  onChange={(e) => setMacroRead(macro, e.target.checked)}
                />
                <span>Mostra tutta la macro-sezione nel portale</span>
              </label>
            </div>
          </summary>
          <div className="space-y-3 border-t border-[var(--prom-line)] px-3 pb-3 pt-2 dark:border-slate-700">
            {macro.subgroups.map((sg) => (
              <div key={sg.id} className="rounded-lg border border-slate-200/90 bg-white/60 p-3 dark:border-slate-600 dark:bg-slate-950/40">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{sg.title}</p>
                  <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      className="rounded border-slate-400 text-amber-600 focus:ring-amber-500/40"
                      checked={subgroupReadOn(sg, draftPermissions)}
                      onChange={(e) => setSubgroupRead(sg, e.target.checked)}
                    />
                    <span>Mostra questa sottosezione</span>
                  </label>
                </div>
                <div className="space-y-2">
                  {sg.resources.map((g) => (
                    <ResourceRow
                      key={g.resourceKey}
                      group={g}
                      draft={draftPermissions}
                      onToggleRead={toggleRead}
                      onSetWrite={setWriteChecked}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function ResourceRow(props: {
  group: PermissionResourceGroup;
  draft: Set<string>;
  onToggleRead: (readId: string | undefined, writeId: string | undefined, checked: boolean) => void;
  onSetWrite: (readId: string | undefined, writeId: string | undefined, checked: boolean, readOn: boolean) => void;
}): JSX.Element {
  const { group: g, draft, onToggleRead, onSetWrite } = props;
  const readId = g.read?.id;
  const writeId = g.write?.id;
  const readOn = hasReadEffective(draft, readId, writeId);
  const writeOn = hasWrite(draft, writeId);

  return (
    <div className="rounded-md border border-slate-200/80 bg-white/85 p-2.5 dark:border-slate-700 dark:bg-slate-950/50">
      <p className="text-xs font-medium text-slate-900 dark:text-slate-100">{g.labelIt}</p>
      <p className="mt-0.5 text-[10px] leading-snug text-slate-600 dark:text-slate-400">
        {writeOn || g.write?.descriptionWriteIt ? g.write?.descriptionWriteIt : g.read?.descriptionReadIt}
      </p>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-800 dark:text-slate-200">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="rounded border-slate-400 text-amber-600 focus:ring-amber-500/40"
            checked={readOn}
            onChange={(e) => onToggleRead(readId, writeId, e.target.checked)}
          />
          <span>Può vedere la pagina</span>
        </label>
        {writeId ? (
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="rounded border-slate-400 text-amber-600 focus:ring-amber-500/40"
              checked={writeOn}
              onChange={(e) => onSetWrite(readId, writeId, e.target.checked, readOn)}
            />
            <span>Può modificare dati</span>
          </label>
        ) : null}
      </div>
      {RESOURCE_FOOTNOTE[g.resourceKey] ? (
        <p className="mt-1.5 border-t border-slate-200/80 pt-1.5 text-[10px] text-slate-500 dark:border-slate-600 dark:text-slate-400">
          {RESOURCE_FOOTNOTE[g.resourceKey]}
        </p>
      ) : null}
    </div>
  );
}
