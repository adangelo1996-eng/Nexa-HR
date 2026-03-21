"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import {
  createAdminRole,
  deleteAdminRole,
  fetchAdminRoles,
  fetchCurrentUser,
  updateAdminRole,
  type Role
} from "@/lib/api";
import { clearSession, getToken } from "@/lib/auth-session";

export default function AdminRolesPage(): React.JSX.Element {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPermissions, setNewPermissions] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRole = roles.find((item) => item.id === selectedRoleId) ?? null;

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
        const list = await fetchAdminRoles(tokenValue);
        setRoles(list);
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

  function parsePermissions(value: string): string[] {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

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
        permissions: parsePermissions(newPermissions)
      });
      setNewName("");
      setNewDescription("");
      setNewPermissions("");
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
        permissions: selectedRole.permissions
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

  function updateSelectedRole(patch: Partial<Role>): void {
    if (!selectedRole) return;
    setRoles((current) => current.map((item) => (item.id === selectedRole.id ? { ...item, ...patch } : item)));
  }

  if (loading) {
    return <p className="text-sm text-slate-300">Caricamento ruoli...</p>;
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-slate-50">Gestione ruoli</h1>
        <p className="mt-1 text-xs text-slate-400">Crea, modifica ed elimina i ruoli organizzativi.</p>
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
                  selectedRoleId === role.id ? "bg-slate-800 text-slate-50" : "bg-slate-900/50 text-slate-300"
                ].join(" ")}
              >
                <p className="font-medium">{role.name}</p>
                <p className="text-[11px] text-slate-400">{role.description || "Nessuna descrizione"}</p>
              </button>
            ))}
          </div>
        </GlassCard>

        <GlassCard title={selectedRole ? "Dettaglio ruolo" : "Nuovo ruolo"} description="Definisci nome, descrizione e permessi (CSV).">
          {selectedRole ? (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-slate-300">Nome</span>
                <input
                  value={selectedRole.name}
                  onChange={(event) => updateSelectedRole({ name: event.target.value })}
                  className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-1.5 text-xs"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-slate-300">Descrizione</span>
                <input
                  value={selectedRole.description ?? ""}
                  onChange={(event) => updateSelectedRole({ description: event.target.value || undefined })}
                  className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-1.5 text-xs"
                />
              </label>
              <label className="md:col-span-2 flex flex-col gap-1 text-xs">
                <span className="text-slate-300">Permessi (comma separated)</span>
                <input
                  value={selectedRole.permissions.join(", ")}
                  onChange={(event) => updateSelectedRole({ permissions: parsePermissions(event.target.value) })}
                  className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-1.5 text-xs"
                />
              </label>
              <div className="md:col-span-2 flex gap-2">
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
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-slate-300">Nome</span>
                <input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-1.5 text-xs"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-slate-300">Descrizione</span>
                <input
                  value={newDescription}
                  onChange={(event) => setNewDescription(event.target.value)}
                  className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-1.5 text-xs"
                />
              </label>
              <label className="md:col-span-2 flex flex-col gap-1 text-xs">
                <span className="text-slate-300">Permessi (comma separated)</span>
                <input
                  value={newPermissions}
                  onChange={(event) => setNewPermissions(event.target.value)}
                  className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-1.5 text-xs"
                />
              </label>
              <div className="md:col-span-2">
                <Button onClick={() => void onCreate()} disabled={submitting}>
                  {submitting ? "Creazione..." : "Crea ruolo"}
                </Button>
              </div>
            </div>
          )}
          {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
        </GlassCard>
      </div>
    </div>
  );
}
