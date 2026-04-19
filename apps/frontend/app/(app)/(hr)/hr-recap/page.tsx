"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchCurrentUser,
  fetchHrRecapPeople,
  fetchHrRecapSummary,
  fetchHrRecapTasks,
  postHrRecapReminder,
  type HrRecapTaskDto
} from "@/lib/api";
import { getSessionUser, getToken, sessionCanAccessHrRecapDashboard, type SessionUser } from "@/lib/auth-session";

type PeopleCategory = "active" | "hr_onboarding" | "offboarding" | "contracts_pending";

function formatDue(iso: string | null): string {
  if (!iso) {
    return "Da eseguire";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

export default function HrRecapPage(): React.JSX.Element {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof fetchHrRecapSummary>> | null>(null);
  const [tasks, setTasks] = useState<HrRecapTaskDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [peopleCategory, setPeopleCategory] = useState<PeopleCategory | null>(null);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [peopleUsers, setPeopleUsers] = useState<Array<{ id: string; fullName: string; email: string }>>([]);
  const [peopleContracts, setPeopleContracts] = useState<
    Array<{ id: string; title: string; recruit_candidate_id: string | null; updated_at: string }>
  >([]);
  const [remindBusyId, setRemindBusyId] = useState<string | null>(null);

  const allowed = useMemo(() => sessionCanAccessHrRecapDashboard(user ?? undefined), [user]);

  const reload = useCallback(async (t: string): Promise<void> => {
    setError(null);
    const [s, tk] = await Promise.all([fetchHrRecapSummary(t), fetchHrRecapTasks(t)]);
    setSummary(s);
    setTasks(tk.tasks);
  }, []);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setToken(t);
    setLoading(true);
    void fetchCurrentUser(t)
      .then(setUser)
      .catch(() => setUser(getSessionUser()));
    void reload(t)
      .catch((e) => setError(e instanceof Error ? e.message : "Errore caricamento"))
      .finally(() => setLoading(false));
  }, [router, reload]);

  useEffect(() => {
    if (!token || !peopleCategory) {
      setPeopleUsers([]);
      setPeopleContracts([]);
      return;
    }
    setPeopleLoading(true);
    setPeopleError(null);
    void fetchHrRecapPeople(token, peopleCategory)
      .then((body) => {
        setPeopleUsers(body.users ?? []);
        setPeopleContracts(body.contracts ?? []);
      })
      .catch((e) => setPeopleError(e instanceof Error ? e.message : "Errore elenco"))
      .finally(() => setPeopleLoading(false));
  }, [token, peopleCategory]);

  async function onRemind(taskId: string): Promise<void> {
    if (!token) {
      return;
    }
    setRemindBusyId(taskId);
    setError(null);
    try {
      await postHrRecapReminder(token, taskId);
      await reload(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sollecito non inviato");
    } finally {
      setRemindBusyId(null);
    }
  }

  function categoryTitle(c: PeopleCategory): string {
    switch (c) {
      case "contracts_pending":
        return "Contratti da firmare";
      case "hr_onboarding":
        return "Dipendenti in onboarding HR";
      case "active":
        return "Dipendenti attivi";
      case "offboarding":
        return "Dipendenti in offboarding";
      default:
        return "";
    }
  }

  if (!allowed && user) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <h1 className="text-xl font-semibold text-synapse-text dark:text-white">Recap HR</h1>
        <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">Non hai i permessi per questa pagina.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-synapse-text dark:text-white">Recap HR</h1>
        <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">
          Sintesi operativa per HR e amministratori: task in sospeso, solleciti e conteggio dipendenti per stato.
        </p>
      </header>

      {error ? <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-[var(--card-border)] md:col-span-2 lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Organico</CardTitle>
            <CardDescription>Clicca su un indicatore per aprire l&apos;elenco.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading || !summary ? (
              <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">Caricamento…</p>
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-synapse-muted dark:text-[#b4c9dc]">
                    Dipendenti totali
                  </p>
                  <p className="text-3xl font-semibold text-[#002D72] dark:text-white">{summary.totalEmployed}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left text-sm transition hover:bg-amber-500/20 dark:border-amber-400/30 dark:text-white"
                    onClick={() => setPeopleCategory("contracts_pending")}
                  >
                    <span className="block text-xs text-synapse-muted dark:text-[#b4c9dc]">Contratti da firmare</span>
                    <span className="text-lg font-semibold">{summary.contractsToSign}</span>
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-left text-sm transition hover:bg-sky-500/20 dark:border-sky-400/30 dark:text-white"
                    onClick={() => setPeopleCategory("hr_onboarding")}
                  >
                    <span className="block text-xs text-synapse-muted dark:text-[#b4c9dc]">Onboarding (dipendenti)</span>
                    <span className="text-lg font-semibold">{summary.hrOnboarding}</span>
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-left text-sm transition hover:bg-emerald-600/15 dark:border-emerald-400/30 dark:text-white"
                    onClick={() => setPeopleCategory("active")}
                  >
                    <span className="block text-xs text-synapse-muted dark:text-[#b4c9dc]">Attivi</span>
                    <span className="text-lg font-semibold">{summary.active}</span>
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-left text-sm transition hover:bg-rose-500/15 dark:border-rose-400/30 dark:text-white"
                    onClick={() => setPeopleCategory("offboarding")}
                  >
                    <span className="block text-xs text-synapse-muted dark:text-[#b4c9dc]">Offboarding</span>
                    <span className="text-lg font-semibold">{summary.offboarding}</span>
                  </button>
                  <Link
                    href="/recruiting/onboarding"
                    className="inline-flex flex-col rounded-xl border border-[var(--card-border)] bg-[color-mix(in_srgb,var(--prom-gold)_12%,transparent)] px-3 py-2 text-left text-sm text-synapse-text transition hover:opacity-90 dark:text-white"
                  >
                    <span className="block text-xs text-synapse-muted dark:text-[#b4c9dc]">
                      Candidati in onboarding (colloqui)
                    </span>
                    <span className="text-lg font-semibold">{summary.recruitingOnboardingCandidates}</span>
                    <span className="mt-1 text-[11px] text-synapse-muted dark:text-[#b4c9dc]">Apri bacheca dedicata →</span>
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-[var(--card-border)] md:col-span-2 lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-lg">Task in sospeso</CardTitle>
            <CardDescription>Approvazioni, note spese in coda HR e contratti non firmati.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">Caricamento…</p>
            ) : tasks.length === 0 ? (
              <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">Nessun task in coda.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[var(--card-border)] text-left text-xs text-synapse-muted dark:text-[#b4c9dc]">
                      <th className="py-2 pr-3 font-medium">Task</th>
                      <th className="py-2 pr-3 font-medium">Scadenza / data</th>
                      <th className="py-2 font-medium">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((row) => (
                      <tr key={row.id} className="border-b border-[var(--card-border)]/80">
                        <td className="py-2 pr-3 align-top">
                          <div className="font-medium text-synapse-text dark:text-white">{row.title}</div>
                          {row.subtitle ? (
                            <div className="text-xs text-synapse-muted dark:text-[#b4c9dc]">{row.subtitle}</div>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3 align-top text-synapse-text dark:text-white">{formatDue(row.dueAt)}</td>
                        <td className="py-2 align-top">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={row.href as Route}
                              className="inline-flex items-center justify-center rounded-lg border border-synapse-gold/30 bg-white/70 px-3 py-1 text-xs font-medium text-synapse-text transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-synapse-gold/45 dark:border-white/20 dark:bg-transparent dark:text-white dark:hover:bg-white/[0.06]"
                            >
                              Apri
                            </Link>
                            <Button
                              type="button"
                              size="sm"
                              disabled={!row.notifyUserId || remindBusyId === row.id}
                              onClick={() => void onRemind(row.id)}
                              title={!row.notifyUserId ? "Nessun destinatario automatico per il sollecito" : undefined}
                            >
                              {remindBusyId === row.id ? "Invio…" : "Sollecito"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {peopleCategory ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          role="presentation"
          onClick={() => setPeopleCategory(null)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-xl dark:bg-[#052642]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2 border-b border-[var(--card-border)] pb-3">
              <h2 className="text-base font-semibold text-synapse-text dark:text-white">
                {categoryTitle(peopleCategory)}
              </h2>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPeopleCategory(null)}>
                Chiudi
              </Button>
            </div>
            {peopleLoading ? (
              <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">Caricamento…</p>
            ) : peopleError ? (
              <p className="text-sm text-rose-600 dark:text-rose-300">{peopleError}</p>
            ) : peopleCategory === "contracts_pending" ? (
              peopleContracts.length === 0 ? (
                <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">Nessun contratto in attesa.</p>
              ) : (
                <ul className="space-y-2">
                  {peopleContracts.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/contracts/${encodeURIComponent(c.id)}`}
                        className="block rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm text-[#002D72] hover:bg-slate-50 dark:text-sky-200 dark:hover:bg-white/5"
                      >
                        <span className="font-medium">{c.title || "Contratto"}</span>
                        <span className="mt-1 block text-xs text-synapse-muted dark:text-[#b4c9dc]">
                          Agg. {formatDue(c.updated_at)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            ) : peopleUsers.length === 0 ? (
              <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">Nessun dipendente in questa categoria.</p>
            ) : (
              <ul className="space-y-2">
                {peopleUsers.map((u) => (
                  <li
                    key={u.id}
                    className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm text-synapse-text dark:text-white"
                  >
                    <div className="font-medium">{u.fullName}</div>
                    <div className="text-xs text-synapse-muted dark:text-[#b4c9dc]">{u.email}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
