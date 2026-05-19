"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminRolePermissionMatrix } from "@/components/admin-role-permission-matrix";
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
  type Role
} from "@/lib/api";
import {
  clearSession,
  getToken,
  sessionCanNexaAdmin,
  shouldClearSessionOnUnauthorizedApiError
} from "@/lib/auth-session";
import { inputOptionalClass, inputRequiredClass } from "@/lib/form-field-styles";
import { expandRolePermissions } from "@/lib/permission-legacy";

function allNexaCatalogIds(catalog: PermissionCatalogResponse): string[] {
  return catalog.nexa_hr.map((p) => p.id);
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
  const [creatingRole, setCreatingRole] = useState(false);

  const selectedRole = roles.find((item) => item.id === selectedRoleId) ?? null;

  const allIds = useMemo(() => (catalog ? allNexaCatalogIds(catalog) : []), [catalog]);

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
        if (!sessionCanNexaAdmin(currentUser)) {
          router.replace("/");
          return;
        }
        const [rolesOutcome, catalogOutcome] = await Promise.allSettled([
          fetchAdminRoles(tokenValue),
          fetchPermissionCatalog(tokenValue)
        ]);
        if (rolesOutcome.status === "rejected") {
          throw rolesOutcome.reason;
        }
        const list = rolesOutcome.value;
        setRoles(list);
        setSelectedRoleId(list[0]?.id ?? "");
        if (catalogOutcome.status === "rejected") {
          const msg =
            catalogOutcome.reason instanceof Error
              ? catalogOutcome.reason.message
              : "Errore caricamento catalogo permessi";
          setError(
            `${msg} Verifica il permesso nexa.admin_roles:read o che l'API /admin/permission-catalog sia raggiungibile.`
          );
        } else {
          setCatalog(catalogOutcome.value);
        }
      } catch (loadError) {
        if (shouldClearSessionOnUnauthorizedApiError(loadError)) {
          clearSession();
          router.replace("/login");
        }
        setError(loadError instanceof Error ? loadError.message : "Errore caricamento ruoli");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [router]);

  useEffect(() => {
    if (!creatingRole) {
      syncDraftFromRole(selectedRole);
    }
  }, [selectedRole, syncDraftFromRole, creatingRole]);

  async function refreshRoles(): Promise<void> {
    if (!token) return;
    const list = await fetchAdminRoles(token);
    setRoles(list);
    if (!selectedRoleId && list[0]) {
      setSelectedRoleId(list[0].id);
    }
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
      setCreatingRole(false);
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
      setCreatingRole(false);
      await refreshRoles();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore eliminazione ruolo");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-700 dark:text-slate-300">Caricamento ruoli...</p>;
  }

  if (!catalog) {
    return (
      <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100">
        <p className="font-medium">Impossibile caricare il catalogo permessi.</p>
        <p className="text-xs opacity-90">
          {error ??
            "Risposta vuota o errore sconosciuto. Controlla i permessi del tuo ruolo e la console di rete."}
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setLoading(true);
            setError(null);
            setCatalog(null);
            const t = getToken();
            if (!t) {
              router.replace("/login");
              return;
            }
            void Promise.allSettled([fetchAdminRoles(t), fetchPermissionCatalog(t)]).then((outcomes) => {
              if (outcomes[0].status === "fulfilled") {
                const list = outcomes[0].value;
                setRoles(list);
                setSelectedRoleId(list[0]?.id ?? "");
              }
              if (outcomes[1].status === "fulfilled") {
                setCatalog(outcomes[1].value);
                setError(null);
              } else {
                const r = outcomes[1].reason;
                setError(r instanceof Error ? r.message : "Catalogo non disponibile");
              }
              setLoading(false);
            });
          }}
        >
          Riprova
        </Button>
      </div>
    );
  }

  const permissionMatrix = (
    <AdminRolePermissionMatrix
      nexaDefs={catalog.nexa_hr}
      draftPermissions={draftPermissions}
      onChange={setDraftPermissions}
    />
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Gestione ruoli</h1>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          Solo sezioni Nexa HR, allineate alla Mappa del portale: macro-sezione, sottosezione e permessi per pagina.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <GlassCard title="Ruoli disponibili" description="Seleziona un ruolo per modificarlo.">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mb-3 w-full"
            onClick={() => {
              setCreatingRole(true);
              setSelectedRoleId("");
              setNewName("");
              setNewDescription("");
              setDraftPermissions(new Set());
            }}
          >
            + Nuovo ruolo
          </Button>
          <div className="space-y-2 text-xs">
            {roles.map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() => {
                  setCreatingRole(false);
                  setSelectedRoleId(role.id);
                }}
                className={[
                  "w-full rounded-lg px-3 py-2 text-left",
                  !creatingRole && selectedRoleId === role.id
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
          title={creatingRole ? "Nuovo ruolo" : selectedRole ? "Dettaglio ruolo" : "Permessi ruolo"}
          description="Visibilità nel portale Nexa HR e livello di modifica per ogni area."
        >
          {selectedRole && !creatingRole ? (
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
                    className={inputRequiredClass}
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
                    className={inputOptionalClass}
                  />
                </label>
              </div>

              {permissionMatrix}

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
          ) : creatingRole ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Nome</span>
                  <input
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    className={inputRequiredClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Descrizione</span>
                  <input
                    value={newDescription}
                    onChange={(event) => setNewDescription(event.target.value)}
                    className={inputOptionalClass}
                  />
                </label>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Definisci quali macro-sezioni e pagine del portale sono visibili, poi salva il nuovo ruolo.
              </p>
              {permissionMatrix}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void onCreate()} disabled={submitting || !newName.trim()}>
                  {submitting ? "Creazione..." : "Crea ruolo"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setCreatingRole(false)} disabled={submitting}>
                  Annulla
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Seleziona un ruolo dall&apos;elenco oppure premi «Nuovo ruolo» per crearne uno.
            </p>
          )}
          {error ? <p className="mt-3 text-xs text-rose-600 dark:text-rose-300">{error}</p> : null}
        </GlassCard>
      </div>
    </div>
  );
}
