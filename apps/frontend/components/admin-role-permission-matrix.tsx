"use client";

import type { JSX } from "react";
import type { PermissionDefinition } from "@/lib/api";
import { PermissionPortalTreeView } from "@/components/permission-portal-tree-view";
import {
  permissionIdsInMacro,
  permissionIdsInSubgroup,
  permissionReadIdsInMacro,
  permissionReadIdsInSubgroup,
  type PermissionPortalMacro,
  type PermissionPortalSubgroup,
  type PermissionResourceGroup
} from "@/lib/permission-portal-groups";
import { hasReadEffective, hasWriteEffective, resourceVisible } from "@/lib/permission-effective";

function macroReadOn(macro: PermissionPortalMacro, draft: Set<string>): boolean {
  if (macro.subgroups.every((sg) => sg.resources.length === 0)) {
    return false;
  }
  return macro.subgroups.every((sg) =>
    sg.resources.every((r) => resourceVisible(draft, r.read?.id, r.write?.id))
  );
}

function subgroupReadOn(sg: PermissionPortalSubgroup, draft: Set<string>): boolean {
  if (sg.resources.length === 0) {
    return false;
  }
  return sg.resources.every((r) => resourceVisible(draft, r.read?.id, r.write?.id));
}

type AdminRolePermissionMatrixProps = {
  nexaDefs: PermissionDefinition[];
  draftPermissions: Set<string>;
  onChange: (next: Set<string>) => void;
};

export function AdminRolePermissionMatrix(props: AdminRolePermissionMatrixProps): JSX.Element {
  const { nexaDefs, draftPermissions, onChange } = props;

  function toggleRead(readId: string | undefined, writeId: string | undefined, checked: boolean): void {
    const next = new Set(draftPermissions);
    if (!checked) {
      if (readId) {
        next.delete(readId);
      }
      if (writeId) {
        next.delete(writeId);
      }
    } else if (!(writeId && next.has(writeId))) {
      if (readId) {
        next.add(readId);
      }
    }
    onChange(next);
  }

  function setWriteChecked(
    readId: string | undefined,
    writeId: string | undefined,
    checked: boolean,
    readOn: boolean
  ): void {
    const next = new Set(draftPermissions);
    if (!writeId) {
      onChange(next);
      return;
    }
    if (checked) {
      next.add(writeId);
      if (readId) {
        next.delete(readId);
      }
    } else {
      next.delete(writeId);
      if (readId && readOn) {
        next.add(readId);
      }
    }
    onChange(next);
  }

  function setMacroRead(macro: PermissionPortalMacro, enabled: boolean): void {
    const next = new Set(draftPermissions);
    if (enabled) {
      for (const id of permissionReadIdsInMacro(macro)) {
        next.add(id);
      }
    } else {
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

  const bulkLabelClass =
    "flex cursor-pointer items-center gap-2 text-[11px] text-[var(--prom-muted)] dark:text-slate-300";

  return (
    <PermissionPortalTreeView
      nexaDefs={nexaDefs}
      grantedIds={draftPermissions}
      intro={
        <p className="text-[11px] leading-relaxed text-[var(--prom-muted)]">
          Le macro-sezioni corrispondono alla <strong className="font-medium text-[var(--prom-text)]">Mappa del portale</strong>
          . «Mostra in portale» abilita la consultazione di tutte le voci della sezione; «Mostra sottosezione» limita a un
          gruppo di pagine. Espandi ogni area per le pagine collegate e per distinguere lettura e modifica.
        </p>
      }
      renderMacroActions={(macro) => (
        <label className={bulkLabelClass} onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="rounded border-slate-400 text-amber-600 focus:ring-amber-500/40"
            checked={macroReadOn(macro, draftPermissions)}
            onChange={(e) => setMacroRead(macro, e.target.checked)}
          />
          <span>Mostra tutta la macro-sezione</span>
        </label>
      )}
      renderSubgroupActions={(sg) => (
        <label className={bulkLabelClass}>
          <input
            type="checkbox"
            className="rounded border-slate-400 text-amber-600 focus:ring-amber-500/40"
            checked={subgroupReadOn(sg, draftPermissions)}
            onChange={(e) => setSubgroupRead(sg, e.target.checked)}
          />
          <span>Mostra sottosezione</span>
        </label>
      )}
      renderResourceControls={(g) => (
        <ResourceEditControls
          group={g}
          draft={draftPermissions}
          onToggleRead={toggleRead}
          onSetWrite={setWriteChecked}
        />
      )}
    />
  );
}

function ResourceEditControls(props: {
  group: PermissionResourceGroup;
  draft: Set<string>;
  onToggleRead: (readId: string | undefined, writeId: string | undefined, checked: boolean) => void;
  onSetWrite: (readId: string | undefined, writeId: string | undefined, checked: boolean, readOn: boolean) => void;
}): JSX.Element {
  const { group: g, draft, onToggleRead, onSetWrite } = props;
  const readId = g.read?.id;
  const writeId = g.write?.id;
  const readOn = hasReadEffective(draft, readId, writeId);
  const writeOn = hasWriteEffective(draft, writeId);

  return (
    <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-[var(--prom-text)]">
      <label className="flex cursor-pointer items-center gap-1.5">
        <input
          type="checkbox"
          className="rounded border-slate-400 text-amber-600 focus:ring-amber-500/40"
          checked={readOn}
          onChange={(e) => onToggleRead(readId, writeId, e.target.checked)}
        />
        <span>Vede</span>
      </label>
      {writeId ? (
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            className="rounded border-slate-400 text-amber-600 focus:ring-amber-500/40"
            checked={writeOn}
            onChange={(e) => onSetWrite(readId, writeId, e.target.checked, readOn)}
          />
          <span>Modifica</span>
        </label>
      ) : null}
    </div>
  );
}
