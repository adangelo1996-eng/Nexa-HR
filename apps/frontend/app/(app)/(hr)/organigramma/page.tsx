"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Network } from "lucide-react";
import { OrgStructureTeamTree } from "@/components/org-structure-tree";
import { Button } from "@/components/ui/button";
import { fetchCurrentUser, fetchOrgStructure, type OrgStructureResponse } from "@/lib/api";
import { clearSession, getToken, shouldClearSessionOnUnauthorizedApiError } from "@/lib/auth-session";

export default function OrganigrammaPage(): React.JSX.Element {
  const router = useRouter();
  const [data, setData] = useState<OrgStructureResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await fetchCurrentUser(token);
      const structure = await fetchOrgStructure(token);
      setData(structure);
    } catch (e) {
      if (shouldClearSessionOnUnauthorizedApiError(e)) {
        clearSession();
        router.replace("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Errore caricamento organigramma");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--prom-gold)_20%,transparent)] text-[var(--prom-text)]">
            <Network className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--prom-text)]">Organigramma strutturale</h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--prom-muted)]">
              Centri di costo, team di lavoro e gerarchia interna per reporting. Per l’organigramma per persone e filtri
              usa anche{" "}
              <a href="/org-chart" className="font-medium text-[var(--prom-gold)] underline-offset-2 hover:underline">
                Organigramma
              </a>
              .
            </p>
          </div>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
          Aggiorna
        </Button>
      </header>

      {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
      {loading ? <p className="text-sm text-[var(--prom-muted)]">Caricamento struttura…</p> : null}

      {data && !loading ? (
        <div className="space-y-6">
          {data.costCenters.length === 0 ? (
            <p className="text-sm text-[var(--prom-muted)]">Nessun centro di costo definito.</p>
          ) : (
            data.costCenters.map((cc) => (
              <section
                key={cc.id}
                className="rounded-2xl border-2 border-[color-mix(in_srgb,var(--prom-gold)_28%,var(--prom-line-strong))] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] p-4 shadow-lg dark:border-slate-600 dark:bg-slate-900/35"
              >
                <header className="mb-4 border-b border-[var(--prom-line)] pb-3">
                  <h2 className="text-base font-semibold text-[var(--prom-text)]">
                    <span className="font-mono text-sm text-[var(--prom-muted)]">{cc.code}</span>
                    <span className="mx-2 text-[var(--prom-muted)]">—</span>
                    {cc.name}
                  </h2>
                  {cc.description ? (
                    <p className="mt-1 text-xs text-[var(--prom-muted)]">{cc.description}</p>
                  ) : null}
                </header>

                <div className="flex flex-col gap-4 xl:flex-row xl:flex-wrap">
                  {cc.teams.map((team) => (
                    <div
                      key={team.id}
                      className="min-w-[min(100%,280px)] flex-1 rounded-xl border border-[var(--prom-line-strong)] bg-[var(--prom-surface)] p-3 dark:bg-slate-950/50"
                    >
                      <h3 className="mb-2 border-b border-[var(--prom-line)] pb-2 text-xs font-semibold uppercase tracking-wide text-[var(--prom-text)]">
                        Team · {team.name}
                      </h3>
                      <OrgStructureTeamTree tree={team.tree} leadUserId={team.leadUserId} />
                    </div>
                  ))}
                </div>

                {cc.unteamedTree.length > 0 ? (
                  <div className="mt-4 rounded-xl border border-dashed border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface)_92%,transparent)] p-3">
                    <h3 className="mb-2 text-xs font-semibold text-[var(--prom-muted)]">
                      Senza team di lavoro (stesso CDC)
                    </h3>
                    <OrgStructureTeamTree tree={cc.unteamedTree} leadUserId={null} />
                  </div>
                ) : null}
              </section>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
