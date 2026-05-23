"use client";

import type { JSX } from "react";
import { PermissionPortalTreeView } from "@/components/permission-portal-tree-view";
import type { PermissionDefinition, UserEffectivePermissionsDto } from "@/lib/api";
import type { PermissionResourceGroup } from "@/lib/permission-portal-groups";
import { hasReadEffective, hasWriteEffective } from "@/lib/permission-effective";

type EffectivePermissionsPanelProps = {
  payload: UserEffectivePermissionsDto;
  nexaCatalog: PermissionDefinition[];
};

export function EffectivePermissionsPanel(props: EffectivePermissionsPanelProps): JSX.Element {
  const { payload, nexaCatalog } = props;
  const granted = new Set(payload.effectivePermissionIds);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_72%,transparent)] px-4 py-3 text-sm">
        <p className="text-[var(--prom-text)]">
          Ruolo assegnato:{" "}
          <strong>{payload.roleName?.trim() || "Nessun ruolo"}</strong>
          {payload.roleId ? (
            <span className="ml-2 text-xs text-[var(--prom-muted)]">({payload.roleId})</span>
          ) : null}
        </p>
        {payload.rolePermissionKeys.length > 0 ? (
          <p className="mt-1 text-xs text-[var(--prom-muted)]">
            Chiavi sul ruolo: {payload.rolePermissionKeys.join(", ")}
          </p>
        ) : null}
        {payload.overrides.length > 0 ? (
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
            Override individuali: {payload.overrides.join(", ")}
          </p>
        ) : (
          <p className="mt-1 text-xs text-[var(--prom-muted)]">Nessun override individuale sul profilo.</p>
        )}
      </div>

      <PermissionPortalTreeView
        nexaDefs={nexaCatalog}
        grantedIds={granted}
        onlyGranted
        intro={
          <p className="text-[11px] leading-relaxed text-[var(--prom-muted)]">
            Permessi effettivi sul catalogo Nexa HR (ruolo espanso con mappatura legacy). Stessa organizzazione della
            mappa portale e della gestione ruoli.
          </p>
        }
        renderResourceControls={(g, ids) => <ResourceBadges group={g} granted={ids} />}
      />
    </div>
  );
}

function ResourceBadges(props: { group: PermissionResourceGroup; granted: Set<string> }): JSX.Element {
  const { group: g, granted } = props;
  const readId = g.read?.id;
  const writeId = g.write?.id;
  const readOn = hasReadEffective(granted, readId, writeId);
  const writeOn = hasWriteEffective(granted, writeId);

  if (!readOn && !writeOn) {
    return <span className="text-[10px] text-[var(--prom-muted)]">—</span>;
  }

  return (
    <span className="flex flex-wrap justify-end gap-1">
      {readOn ? (
        <span className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-900 dark:text-cyan-100">
          Consultazione
        </span>
      ) : null}
      {writeOn ? (
        <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-950 dark:text-amber-100">
          Modifica
        </span>
      ) : null}
    </span>
  );
}
