"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import {
  createAdminCostCenter,
  deleteAdminCostCenter,
  fetchAdminCostCenters,
  fetchCurrentUser,
  updateAdminCostCenter,
  type CostCenter
} from "@/lib/api";
import { clearSession, getToken } from "@/lib/auth-session";

export default function AdminCostCentersPage(): React.JSX.Element {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = costCenters.find((item) => item.id === selectedId) ?? null;

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
        const list = await fetchAdminCostCenters(tokenValue);
        setCostCenters(list);
        setSelectedId(list[0]?.id ?? "");
      } catch (loadError) {
        clearSession();
        router.replace("/login");
        setError(loadError instanceof Error ? loadError.message : "Errore caricamento centri di costo");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [router]);

  async function refresh(): Promise<void> {
    if (!token) return;
    const list = await fetchAdminCostCenters(token);
    setCostCenters(list);
    if (!selectedId && list[0]) {
      setSelectedId(list[0].id);
    }
  }

  async function onCreate(): Promise<void> {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      await createAdminCostCenter(token, {
        code: newCode,
        name: newName,
        description: newDescription || undefined
      });
      setNewCode("");
      setNewName("");
      setNewDescription("");
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore creazione centro di costo");
    } finally {
      setSubmitting(false);
    }
  }

  async function onUpdate(): Promise<void> {
    if (!token || !selected) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateAdminCostCenter(token, selected.id, {
        code: selected.code,
        name: selected.name,
        description: selected.description
      });
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore aggiornamento centro di costo");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(): Promise<void> {
    if (!token || !selected) return;
    setSubmitting(true);
    setError(null);
    try {
      await deleteAdminCostCenter(token, selected.id);
      setSelectedId("");
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore eliminazione centro di costo");
    } finally {
      setSubmitting(false);
    }
  }

  function updateSelected(patch: Partial<CostCenter>): void {
    if (!selected) return;
    setCostCenters((current) =>
      current.map((item) => (item.id === selected.id ? { ...item, ...patch } : item))
    );
  }

  if (loading) {
    return <p className="text-sm text-slate-300">Caricamento centri di costo...</p>;
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-slate-50">Gestione centri di costo</h1>
        <p className="mt-1 text-xs text-slate-400">Mantieni codici e descrizioni usati in anagrafica utente.</p>
      </header>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <GlassCard title="Centri di costo" description="Elenco completo.">
          <div className="space-y-2 text-xs">
            {costCenters.map((center) => (
              <button
                key={center.id}
                type="button"
                onClick={() => setSelectedId(center.id)}
                className={[
                  "w-full rounded-lg px-3 py-2 text-left",
                  selectedId === center.id ? "bg-slate-800 text-slate-50" : "bg-slate-900/50 text-slate-300"
                ].join(" ")}
              >
                <p className="font-medium">
                  {center.code} - {center.name}
                </p>
                <p className="text-[11px] text-slate-400">{center.description || "Nessuna descrizione"}</p>
              </button>
            ))}
          </div>
        </GlassCard>

        <GlassCard
          title={selected ? "Dettaglio centro di costo" : "Nuovo centro di costo"}
          description="Compila codice, nome e descrizione."
        >
          {selected ? (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-slate-300">Codice</span>
                <input
                  value={selected.code}
                  onChange={(event) => updateSelected({ code: event.target.value })}
                  className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-1.5 text-xs"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-slate-300">Nome</span>
                <input
                  value={selected.name}
                  onChange={(event) => updateSelected({ name: event.target.value })}
                  className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-1.5 text-xs"
                />
              </label>
              <label className="md:col-span-2 flex flex-col gap-1 text-xs">
                <span className="text-slate-300">Descrizione</span>
                <input
                  value={selected.description ?? ""}
                  onChange={(event) => updateSelected({ description: event.target.value || undefined })}
                  className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-1.5 text-xs"
                />
              </label>
              <div className="md:col-span-2 flex gap-2">
                <Button onClick={() => void onUpdate()} disabled={submitting}>
                  {submitting ? "Salvataggio..." : "Salva centro"}
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
                <span className="text-slate-300">Codice</span>
                <input
                  value={newCode}
                  onChange={(event) => setNewCode(event.target.value)}
                  className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-1.5 text-xs"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-slate-300">Nome</span>
                <input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-1.5 text-xs"
                />
              </label>
              <label className="md:col-span-2 flex flex-col gap-1 text-xs">
                <span className="text-slate-300">Descrizione</span>
                <input
                  value={newDescription}
                  onChange={(event) => setNewDescription(event.target.value)}
                  className="rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-1.5 text-xs"
                />
              </label>
              <div className="md:col-span-2">
                <Button onClick={() => void onCreate()} disabled={submitting}>
                  {submitting ? "Creazione..." : "Crea centro di costo"}
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
