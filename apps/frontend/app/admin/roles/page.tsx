"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import {
  createAdminRole,
  deleteAdminRole,
  fetchAdminRoles,
  fetchCurrentUser,
  fetchPermissionCatalog,
  updateAdminRole,
  type PermissionCatalogResponse,
  type PermissionDefinition,
  type Role
} from "@/lib/api";
import { clearSession, getToken } from "@/lib/auth-session";
import { expandRolePermissions } from "@/lib/permission-legacy";

const CATEGORY_LABEL: Record<keyof PermissionCatalogResponse, string> = {
  nexa_hr: "Nexa HR",
  plasticity: "Plasticity",
  soma: "SOMA",
  hub: "Synapse Central Hub"
};

function allCatalogIds(catalog: PermissionCatalogResponse): string[] {
  return [
    ...catalog.nexa_hr,
    ...catalog.plasticity,
    ...catalog.soma,
    ...catalog.hub
  ].map((p) => p.id);
}

function groupByResource(defs: PermissionDefinition[]): Array<{
  resourceKey: string;
  labelIt: string;
  read?: PermissionDefinition;
  write?: PermissionDefinition;
}> {
  const map = new Map<string, PermissionDefinition[]>();
  for (const d of defs) {
    const list = map.get(d.resourceKey) ?? [];
    list.push(d);
    map.set(d.resourceKey, list);
  }
  return Array.from(map.entries()).map(([resourceKey, arr]) => {
    const read = arr.find((x) => x.suffix === "read");
    const write = arr.find((x) => x.suffix === "write");
    return {
      resourceKey,
      labelIt: read?.labelIt ?? write?.labelIt ?? resourceKey,
      read,
      write
    };
  });
}

function hasReadEffective(set: Set<string>, readId: string | undefined, writeId: string | undefined): boolean {
  if (writeId && set.has(writeId)) {
    return true;
  }
  if (readId && set.has(readId)) {
    return true;
  }
  return false;
}

function hasWrite(set: Set<string>, writeId: string | undefined): boolean {
  return Boolean(writeId && set.has(writeId));
}

export default function AdminRolesPage(): React.JSX.Element {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [catalog, setCatalog] = useState<PermissionCatalogResponse | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [draftPermissions, setDraftPermissions] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRole = roles.find((item) => item.id === selectedRoleId) ?? null;

  const allIds = useMemo(() => (catalog ? allCatalogIds(catalog) : []), [catalog]);

  const syncDraftFromRole = useCallback(
    (role: Role | null) => {
      if (!role || !allIds.length) {
        setDraftPermissions(new Set());
        return;
      }
      setDraftPermissions(expandRolePermissions(role.permissions ?? [], allIds));
    },
    [allIds]
  );

  useEffect(() => {
    const sessionToken = getToken();
    if (!sessionToken) {
      router.replace("/login");
      return;
    }
    const tokenValue = sessionToken;
    setToken(tokenValue);

    async function load(): Promise<void> {
      try {
        const currentUser = await fetchCurrentUser(tokenValue);
        if (currentUser.role !== "admin") {
          router.replace("/");
          return;
        }
        const [list, cat] = await Promise.all([
          fetchAdminRoles(tokenValue),
          fetchPermissionCatalog(tokenValue)
        ]);
        setRoles(list);
        setCatalog(cat);
        setSelectedRoleId(list[0]?.id ?? "");
      } catch (loadError) {
        clearSession();
        router.replace("/login");
        setError(loadError instanceof Error ? loadError.message : "Errore caricamento ruoli");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [router]);

  useEffect(() => {
    syncDraftFromRole(selectedRole);
  }, [selectedRole, syncDraftFromRole]);

  async function refreshRoles(): Promise<void> {
    if (!token) return;
    const list = await fetchAdminRoles(token);
    setRoles(list);
    if (!selectedRoleId && list[0]) {
      setSelectedRoleId(list[0].id);
    }
  }

  function toggleRead(resourceKey: string, readId: string | undefined, writeId: string | undefined, checked: boolean): void {
    setDraftPermissions((prev) => {
      const next = new Set(prev);
      if (!checked) {
        if (readId) {
          next.delete(readId);
        }
        if (writeId) {
          next.delete(writeId);
        }
        return next;
      }
      if (writeId && next.has(writeId)) {
        return next;
      }
      if (readId) {
        next.add(readId);
      }
      return next;
    });
  }

  function setWriteChecked(
    readId: string | undefined,
    writeId: string | undefined,
    checked: boolean,
    readChecked: boolean
  ): void {
    setDraftPermissions((prev) => {
      const next = new Set(prev);
      if (!writeId) {
        return next;
      }
      if (checked) {
        next.add(writeId);
        if (readId) {
          next.delete(readId);
        }
      } else {
        next.delete(writeId);
        if (readId && readChecked) {
          next.add(readId);
        }
      }
      return next;
    });
  }

  async function onCreate(): Promise<void> {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      await createAdminRole(token, {
        name: newName,
        description: newDescription || undefined,
        permissions: Array.from(draftPermissions).sort()
      });
      setNewName("");
      setNewDescription("");
      setDraftPermissions(new Set());
      await refreshRoles();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore creazione ruolo");
    } finally {
      setSubmitting(false);
    }
  }

  async function onUpdate(): Promise<void> {
    if (!token || !selectedRole) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateAdminRole(token, selectedRole.id, {
        name: selectedRole.name,
        description: selectedRole.description,
        permissions: Array.from(draftPermissions).sort()
      });
      await refreshRoles();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore aggiornamento ruolo");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(): Promise<void> {
    if (!token || !selectedRole) return;
    setSubmitting(true);
    setError(null);
    try {
      await deleteAdminRole(token, selectedRole.id);
      setSelectedRoleId("");
      await refreshRoles();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore eliminazione ruolo");
    } finally {
      setSubmitting(false);
    }
  }

  function selectAllInCategory(cat: keyof PermissionCatalogResponse): void {
    if (!catalog) return;
    const defs = catalog[cat];
    setDraftPermissions((prev) => {
      const next = new Set(prev);
      for (const p of defs) {
        next.add(p.id);
      }
      return next;
    });
  }

  function clearCategory(cat: keyof PermissionCatalogResponse): void {
    if (!catalog) return;
    const defs = catalog[cat];
    setDraftPermissions((prev) => {
      const next = new Set(prev);
      for (const p of defs) {
        next.delete(p.id);
      }
      return next;
    });
  }

  if (loading || !catalog) {
    return <p className="text-sm text-slate-700 dark:text-slate-300">Caricamento ruoli...</p>;
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Gestione ruoli</h1>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          Categorie e permessi con etichette chiare: Può consultare / Può modificare.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <GlassCard title="Ruoli disponibili" description="Seleziona un ruolo per modificarlo.">
          <div className="space-y-2 text-xs">
            {roles.map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() => setSelectedRoleId(role.id)}
                className={[
                  "w-full rounded-lg px-3 py-2 text-left",
                  selectedRoleId === role.id
                    ? "bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-50"
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800/40"
                ].join(" ")}
              >
                <p className="font-medium">{role.name}</p>
                <p className="text-[11px] text-slate-400">{role.description || "Nessuna descrizione"}</p>
              </button>
            ))}
          </div>
        </GlassCard>

        <GlassCard
          title={selectedRole ? "Dettaglio ruolo" : "Nuovo ruolo"}
          description="Spunta le risorse consentite. Può modificare include le azioni di scrittura."
        >
          {selectedRole ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Nome</span>
                  <input
                    value={selectedRole.name}
                    onChange={(event) =>
                      setRoles((current) =>
                        current.map((item) =>
                          item.id === selectedRole.id ? { ...item, name: event.target.value } : item
                        )
                      )
                    }
                    className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-1.5 text-xs"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Descrizione</span>
                  <input
                    value={selectedRole.description ?? ""}
                    onChange={(event) =>
                      setRoles((current) =>
                        current.map((item) =>
                          item.id === selectedRole.id
                            ? { ...item, description: event.target.value || undefined }
                            : item
                        )
                      )
                    }
                    className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-1.5 text-xs"
                  />
                </label>
              </div>

              {(Object.keys(CATEGORY_LABEL) as Array<keyof PermissionCatalogResponse>).map((catKey) => {
                const defs = catalog[catKey];
                const groups = groupByResource(defs);
                return (
                  <details key={catKey} open className="rounded-lg border border-slate-700/50 bg-slate-950/30">
                    <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-slate-200">
                      {CATEGORY_LABEL[catKey]}
                    </summary>
                    <div className="flex flex-wrap gap-2 border-t border-slate-800/60 px-3 py-2">
                      <button
                        type="button"
                        className="text-[11px] text-synapse-gold underline"
                        onClick={() => selectAllInCategory(catKey)}
                      >
                        Seleziona tutto
                      </button>
                      <button
                        type="button"
                        className="text-[11px] text-slate-400 underline"
                        onClick={() => clearCategory(catKey)}
                      >
                        Nessuno
                      </button>
                    </div>
                    <div className="space-y-3 px-3 pb-3">
                      {groups.map((g) => {
                        const readId = g.read?.id;
                        const writeId = g.write?.id;
                        const readOn = hasReadEffective(draftPermissions, readId, writeId);
                        const writeOn = hasWrite(draftPermissions, writeId);
                        return (
                          <div
                            key={`${catKey}-${g.resourceKey}`}
                            className="rounded-md border border-slate-800/80 bg-slate-950/40 p-3"
                          >
                            <p className="text-xs font-medium text-slate-100">{g.labelIt}</p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {writeOn || g.write?.descriptionWriteIt
                                ? g.write?.descriptionWriteIt
                                : g.read?.descriptionReadIt}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-4 text-xs">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  data-perm-read={g.resourceKey}
                                  checked={readOn}
                                  onChange={(e) => toggleRead(g.resourceKey, readId, writeId, e.target.checked)}
                                />
                                <span>Può consultare</span>
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={writeOn}
                                  onChange={(e) =>
                                    setWriteChecked(readId, writeId, e.target.checked, readOn)
                                  }
                                />
                                <span>Può modificare</span>
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                );
              })}

              <div className="flex gap-2">
                <Button onClick={() => void onUpdate()} disabled={submitting}>
                  {submitting ? "Salvataggio..." : "Salva ruolo"}
                </Button>
                <Button
                  onClick={() => void onDelete()}
                  disabled={submitting}
                  className="bg-rose-300 text-slate-900 hover:bg-rose-200"
                >
                  Elimina
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Nome</span>
                  <input
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-1.5 text-xs"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Descrizione</span>
                  <input
                    value={newDescription}
                    onChange={(event) => setNewDescription(event.target.value)}
                    className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-1.5 text-xs"
                  />
                </label>
              </div>
              <p className="text-[11px] text-slate-500">
                Per un nuovo ruolo, seleziona i permessi nelle categorie qui sotto prima di creare.
              </p>
              {(Object.keys(CATEGORY_LABEL) as Array<keyof PermissionCatalogResponse>).map((catKey) => {
                const defs = catalog[catKey];
                const groups = groupByResource(defs);
                return (
                  <details key={`new-${catKey}`} open className="rounded-lg border border-slate-700/50 bg-slate-950/30">
                    <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-slate-200">
                      {CATEGORY_LABEL[catKey]}
                    </summary>
                    <div className="flex flex-wrap gap-2 border-t border-slate-800/60 px-3 py-2">
                      <button
                        type="button"
                        className="text-[11px] text-synapse-gold underline"
                        onClick={() => selectAllInCategory(catKey)}
                      >
                        Seleziona tutto
                      </button>
                      <button
                        type="button"
                        className="text-[11px] text-slate-400 underline"
                        onClick={() => clearCategory(catKey)}
                      >
                        Nessuno
                      </button>
                    </div>
                    <div className="space-y-3 px-3 pb-3">
                      {groups.map((g) => {
                        const readId = g.read?.id;
                        const writeId = g.write?.id;
                        const readOn = hasReadEffective(draftPermissions, readId, writeId);
                        const writeOn = hasWrite(draftPermissions, writeId);
                        return (
                          <div
                            key={`new-${catKey}-${g.resourceKey}`}
                            className="rounded-md border border-slate-800/80 bg-slate-950/40 p-3"
                          >
                            <p className="text-xs font-medium text-slate-100">{g.labelIt}</p>
                            <div className="mt-2 flex flex-wrap gap-4 text-xs">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  data-perm-read={g.resourceKey}
                                  checked={readOn}
                                  onChange={(e) => toggleRead(g.resourceKey, readId, writeId, e.target.checked)}
                                />
                                <span>Può consultare</span>
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={writeOn}
                                  onChange={(e) =>
                                    setWriteChecked(readId, writeId, e.target.checked, readOn)
                                  }
                                />
                                <span>Può modificare</span>
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
              <Button onClick={() => void onCreate()} disabled={submitting}>
                {submitting ? "Creazione..." : "Crea ruolo"}
              </Button>
            </div>
          )}
          {error ? <p className="mt-3 text-xs text-rose-600 dark:text-rose-300">{error}</p> : null}
        </GlassCard>
      </div>
    </div>
  );
}
