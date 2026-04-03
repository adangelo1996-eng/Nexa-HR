"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { OrgChart, type OrgChartNode } from "@/components/org-chart";
import { Button } from "@/components/ui/button";
import {
  fetchAdminCostCenters,
  fetchCurrentUser,
  fetchOrgChart,
  type CostCenter,
  type OrgChartResponse
} from "@/lib/api";
import { getToken, getSessionUser, type SessionUser, type UserRole } from "@/lib/auth-session";

const ROLES: { value: UserRole; label: string }[] = [
  { value: "user", label: "Utente (accesso standard)" },
  { value: "superuser", label: "Superuser" }
];

export default function OrgChartPage(): React.JSX.Element {
  const [data, setData] = useState<OrgChartResponse>({ nodes: [], edges: [] });
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [costCenterId, setCostCenterId] = useState("");
  const [role, setRole] = useState<UserRole | "">("");
  const [selected, setSelected] = useState<OrgChartNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      return;
    }
    setErr(null);
    try {
      const me = await fetchCurrentUser(token).catch(() => getSessionUser() as SessionUser);
      setUser(me ?? getSessionUser());
      const chart = await fetchOrgChart(token, {
        costCenterId: costCenterId || undefined,
        role: role || undefined
      });
      setData(chart);
      try {
        const cc = await fetchAdminCostCenters(token);
        setCenters(cc);
      } catch {
        setCenters([]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [costCenterId, role]);

  useEffect(() => {
    void load();
  }, [load]);

  const centerLabel = useCallback(
    (id?: string) => {
      if (!id) {
        return "—";
      }
      return centers.find((c) => c.id === id)?.name ?? id;
    },
    [centers]
  );

  const sediOptions = useMemo((): Pick<CostCenter, "id" | "name">[] => {
    const fromNodes = [...new Set(data.nodes.map((n) => n.costCenterId).filter(Boolean))] as string[];
    if (centers.length) {
      return centers
        .filter((c) => fromNodes.length === 0 || fromNodes.includes(c.id))
        .map((c) => ({ id: c.id, name: c.name }));
    }
    return fromNodes.sort().map((id) => ({ id, name: id }));
  }, [data.nodes, centers]);

  return (
    <div className="relative space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--prom-text)]">Organigramma</h1>
          <p className="text-sm text-[var(--prom-muted)]">Filtri e dettaglio persona</p>
        </div>
        <label className="text-sm text-[var(--prom-muted)]">
          Sede
          <select
            value={costCenterId}
            onChange={(e) => setCostCenterId(e.target.value)}
            className="mt-1 block w-48 rounded-lg border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface)_90%,transparent)] px-3 py-2 text-[var(--prom-text)]"
          >
            <option value="">Tutte</option>
            {sediOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-[var(--prom-muted)]">
          Ruolo
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole | "")}
            className="mt-1 block w-48 rounded-lg border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface)_90%,transparent)] px-3 py-2 text-[var(--prom-text)]"
          >
            <option value="">Tutti</option>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
          Aggiorna
        </Button>
      </div>

      {err ? <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p> : null}
      {loading ? <p className="text-sm text-[var(--prom-muted)]">Caricamento…</p> : null}

      <OrgChart
        nodes={data.nodes}
        edges={data.edges}
        framed={false}
        heightClass="h-[min(560px,calc(100dvh-12rem))]"
        onNodeSelect={setSelected}
      />

      {selected ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/30 transition-opacity md:hidden"
            aria-label="Chiudi"
            onClick={() => setSelected(null)}
          />
          <aside className="fixed bottom-0 right-0 top-0 z-50 flex w-[min(100vw,340px)] flex-col border-l border-[var(--prom-line)] bg-[var(--prom-surface)] p-4 shadow-[var(--card-shadow)] transition-transform">
            <div className="flex justify-between gap-2">
              <h2 className="text-lg font-semibold text-[var(--prom-text)]">{selected.label}</h2>
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSelected(null)} aria-label="Chiudi">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-1 text-sm text-[var(--prom-muted)]">{selected.roleName ?? selected.role}</p>
            <p className="mt-3 text-sm text-[var(--prom-text)]">
              Sede:{" "}
              <span className="text-[var(--prom-muted)]">
                {selected.costCenterName ?? centerLabel(selected.costCenterId)}
              </span>
            </p>
            {selected.email ? (
              <p className="mt-2 text-xs text-[var(--prom-muted)]">
                <a href={`mailto:${selected.email}`} className="text-[var(--prom-gold)] hover:underline">
                  {selected.email}
                </a>
              </p>
            ) : null}
            {user?.id === selected.id ? (
              <Link
                href={"/settings" as Route}
                className="mt-4 inline-block text-sm font-medium text-[var(--prom-gold)] underline-offset-2 hover:underline"
              >
                Profilo
              </Link>
            ) : (
              <p className="mt-4 text-xs text-[var(--prom-muted)]">Profilo completo disponibile per l&apos;account.</p>
            )}
          </aside>
        </>
      ) : null}
    </div>
  );
}
