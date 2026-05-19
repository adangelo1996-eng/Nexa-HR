"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { OrgChart, type OrgChartNode } from "@/components/org-chart";
import { NexaPageHelpButton } from "@/components/nexa-page-help-button";
import { Button } from "@/components/ui/button";
import {
  fetchAdminCostCenters,
  fetchCurrentUser,
  fetchOrgChart,
  fetchUsers,
  type CostCenter,
  type OrgChartResponse,
  type User
} from "@/lib/api";
import { CostCenterLink, EmployeeLink } from "@/components/nexa-entity-links";
import {
  getToken,
  getSessionUser,
  sessionIsPlainEmployee,
  sessionUsesHrReorganizedNav,
  type SessionUser,
  type UserRole
} from "@/lib/auth-session";

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
  const [usersById, setUsersById] = useState<Record<string, User>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const chartHostRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      return;
    }
    setErr(null);
    try {
      const me = await fetchCurrentUser(token).catch(() => getSessionUser() as SessionUser);
      setUser(me ?? getSessionUser());
      const [chart, people] = await Promise.all([
        fetchOrgChart(token, {
          costCenterId: costCenterId || undefined,
          role: role || undefined
        }),
        fetchUsers(token).catch(() => [] as User[])
      ]);
      setData(chart);
      const umap: Record<string, User> = {};
      for (const u of people) {
        umap[u.id] = u;
      }
      setUsersById(umap);
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

  const nodesSortedForList = useMemo(
    () => [...data.nodes].sort((a, b) => a.label.localeCompare(b.label, "it")),
    [data.nodes]
  );

  const detailUser = selected ? usersById[selected.id] : undefined;
  const managerName = useMemo(() => {
    const mid = detailUser?.managerId ?? selected?.managerId;
    if (!mid) return null;
    const m = usersById[mid];
    return m?.fullName ?? m?.email ?? null;
  }, [detailUser?.managerId, selected?.managerId, usersById]);

  const sediOptions = useMemo((): Pick<CostCenter, "id" | "name">[] => {
    const fromNodes = [...new Set(data.nodes.map((n) => n.costCenterId).filter(Boolean))] as string[];
    if (centers.length) {
      return centers
        .filter((c) => fromNodes.length === 0 || fromNodes.includes(c.id))
        .map((c) => ({ id: c.id, name: c.name }));
    }
    return fromNodes.sort().map((id) => ({ id, name: id }));
  }, [data.nodes, centers]);

  const canSeeFullOrg = user && sessionUsesHrReorganizedNav(user, false);
  if (!loading && user && !canSeeFullOrg) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface)] p-6 text-center">
        <h1 className="text-lg font-semibold text-[var(--prom-text)]">Organigramma riservato</h1>
        <p className="mt-2 text-sm text-[var(--prom-muted)]">
          {sessionIsPlainEmployee(user)
            ? "Come dipendente vedi solo il tuo perimetro in «Il mio team», non l'intera azienda."
            : "Non hai permesso per l'organigramma completo."}
        </p>
        <Link
          href={"/il-mio-team" as Route}
          className="mt-4 inline-flex rounded-lg bg-[var(--prom-gold)] px-4 py-2 text-sm font-medium text-[#0a1628]"
        >
          Vai a Il mio team
        </Link>
      </div>
    );
  }

  return (
    <div className="relative space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-[var(--prom-text)]">Organigramma</h1>
          <p className="text-sm text-[var(--prom-muted)]">Filtri e dettaglio persona</p>
        </div>
        <NexaPageHelpButton pageKey="org-chart" />
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const el = chartHostRef.current;
            if (!el) return;
            void (document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.());
          }}
        >
          Schermo intero
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            window.print();
          }}
        >
          Stampa / PDF
        </Button>
      </div>

      {err ? <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p> : null}
      {loading ? <p className="text-sm text-[var(--prom-muted)]">Caricamento…</p> : null}

      <div ref={chartHostRef} className="org-chart-print-area rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface)] p-2">
        <OrgChart
          nodes={data.nodes}
          edges={data.edges}
          framed={false}
          heightClass="h-[min(560px,calc(100dvh-12rem))]"
          highlightUserId={user?.id}
          onNodeSelect={setSelected}
        />
      </div>

      {data.nodes.length > 0 ? (
        <details className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] p-3 text-sm text-[var(--prom-text)] shadow-[var(--card-shadow)]">
          <summary className="cursor-pointer font-medium text-[var(--prom-muted)] outline-none hover:text-[var(--prom-text)]">
            Elenco persone ({data.nodes.length})
          </summary>
          <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto overscroll-contain pr-1">
            {nodesSortedForList.map((n) => {
              const isMe = user?.id === n.id;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    className={
                      "w-full rounded-lg px-2 py-1.5 text-left transition-colors " +
                      (isMe
                        ? "border border-[var(--prom-gold)] bg-[color-mix(in_srgb,var(--prom-gold)_16%,transparent)] font-medium text-[var(--prom-text)]"
                        : "border border-transparent text-[var(--prom-muted)] hover:bg-[color-mix(in_srgb,var(--prom-gold)_8%,transparent)] hover:text-[var(--prom-text)]")
                    }
                    onClick={() => setSelected(n)}
                  >
                    {n.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}

      {selected ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-[2px] transition-opacity"
            aria-label="Chiudi pannello"
            onClick={() => setSelected(null)}
          />
          <aside
            className={
              "fixed bottom-0 right-0 top-0 z-[210] flex w-[min(100vw,400px)] flex-col overflow-y-auto border-l bg-[var(--prom-surface)] p-5 pb-24 pt-20 shadow-[var(--card-shadow)] transition-transform sm:pt-16 " +
              (user?.id === selected.id
                ? "border-[var(--prom-gold)] ring-2 ring-[color-mix(in_srgb,var(--prom-gold)_35%,transparent)]"
                : "border-[var(--prom-line)]")
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold leading-tight text-[var(--prom-text)]">
                  <EmployeeLink
                    userId={selected.id}
                    label={selected.label}
                    managerId={detailUser?.managerId ?? selected.managerId}
                    viewer={user}
                    className="text-[var(--prom-text)] hover:text-[var(--prom-gold)] hover:underline"
                  />
                </h2>
                <p className="mt-1 text-sm text-[var(--prom-muted)]">{selected.roleName ?? selected.role}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0 gap-1.5 rounded-full border-[var(--prom-line-strong)] px-3"
                onClick={() => setSelected(null)}
                aria-label="Chiudi scheda"
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline">Chiudi</span>
              </Button>
            </div>

            <dl className="mt-6 space-y-3 text-sm">
              <div className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] px-3 py-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">Sede</dt>
                <dd className="mt-0.5 text-[var(--prom-text)]">
                  {selected.costCenterId ? (
                    <CostCenterLink
                      costCenterId={selected.costCenterId}
                      label={selected.costCenterName ?? centerLabel(selected.costCenterId)}
                      viewer={user}
                    />
                  ) : (
                    selected.costCenterName ?? centerLabel(selected.costCenterId)
                  )}
                </dd>
              </div>
              {(selected.email || detailUser?.email) ? (
                <div className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] px-3 py-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">Email</dt>
                  <dd className="mt-0.5">
                    <a
                      href={`mailto:${selected.email ?? detailUser?.email}`}
                      className="break-all text-[var(--prom-gold)] hover:underline"
                    >
                      {selected.email ?? detailUser?.email}
                    </a>
                  </dd>
                </div>
              ) : null}
              {detailUser?.phone ? (
                <div className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] px-3 py-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">Telefono</dt>
                  <dd className="mt-0.5">
                    <a href={`tel:${detailUser.phone}`} className="text-[var(--prom-text)] hover:underline">
                      {detailUser.phone}
                    </a>
                  </dd>
                </div>
              ) : null}
              {detailUser?.hireDate ? (
                <div className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] px-3 py-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">Data assunzione</dt>
                  <dd className="mt-0.5 text-[var(--prom-text)]">
                    {new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(
                      new Date(detailUser.hireDate + "T12:00:00")
                    )}
                  </dd>
                </div>
              ) : null}
              {managerName ? (
                <div className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] px-3 py-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">Responsabile</dt>
                  <dd className="mt-0.5 text-[var(--prom-text)]">{managerName}</dd>
                </div>
              ) : null}
              {detailUser?.contractType ? (
                <div className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] px-3 py-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">Contratto</dt>
                  <dd className="mt-0.5 text-[var(--prom-text)]">{detailUser.contractType}</dd>
                  {detailUser.weeklyContractHours != null ? (
                    <p className="mt-1 text-xs text-[var(--prom-muted)]">{detailUser.weeklyContractHours} h/settimana</p>
                  ) : null}
                </div>
              ) : null}
            </dl>

            <Link
              href={`/employee/${encodeURIComponent(selected.id)}` as Route}
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl border border-[var(--prom-gold)] bg-[color-mix(in_srgb,var(--prom-gold)_12%,transparent)] px-4 py-2.5 text-sm font-medium text-[var(--prom-text)] transition hover:bg-[color-mix(in_srgb,var(--prom-gold)_20%,transparent)]"
              onClick={() => setSelected(null)}
            >
              Vai al profilo
            </Link>
            {user?.id === selected.id ? (
              <Link
                href={"/settings" as Route}
                className="mt-3 block text-center text-xs font-medium text-[var(--prom-gold)] underline-offset-2 hover:underline"
                onClick={() => setSelected(null)}
              >
                Impostazioni account
              </Link>
            ) : (
              <p className="mt-4 text-xs leading-relaxed text-[var(--prom-muted)]">
                Scheda in sola lettura. Dati retributivi e bancari solo per titolare o HR autorizzato.
              </p>
            )}
          </aside>
        </>
      ) : null}
    </div>
  );
}
