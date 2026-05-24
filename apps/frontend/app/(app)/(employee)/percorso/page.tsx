"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { NexaHrAppPage } from "@/components/nexa-hr-app-page";
import { EmployeeLink } from "@/components/nexa-entity-links";
import { Button } from "@/components/ui/button";
import {
  completeMyOnboarding,
  completeMyOffboarding,
  fetchCurrentUser,
  fetchMyOffboardingChecklist,
  fetchMyOnboardingChecklist,
  fetchMyTeamContext,
  patchMyOffboardingChecklistItem,
  patchMyOnboardingChecklistItem,
  type OffboardingChecklistStatusDto,
  type OnboardingChecklistStatusDto
} from "@/lib/api";
import { getSessionUser, getToken, type SessionUser } from "@/lib/auth-session";

type EmploymentState = "active" | "hr_onboarding" | "offboarding";

const ITEM_HREF: Record<string, Route | undefined> = {
  "emp-welcome": "/welcome" as Route,
  "emp-settings": "/settings" as Route,
  "emp-payslips": "/payslips" as Route,
  "emp-team": "/il-mio-team" as Route,
  "emp-formazione": "/percorso/formazione" as Route,
  "emp-workflow": "/workflow" as Route,
  "emp-expenses": "/expenses" as Route
};

const STATE_HEADLINE: Record<EmploymentState, { title: string; blurb: string }> = {
  active: {
    title: "In servizio",
    blurb: "Passi utili per tenere aggiornati profilo, presenze e riferimenti del team."
  },
  hr_onboarding: {
    title: "Onboarding",
    blurb: "Checklist per completare l'ingresso in azienda."
  },
  offboarding: {
    title: "Uscita",
    blurb: "Passi consigliati prima della fine del rapporto. Coordina con HR e il manager."
  }
};

export default function PercorsoPage(): React.JSX.Element {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [team, setTeam] = useState<Awaited<ReturnType<typeof fetchMyTeamContext>> | null>(null);
  const [state, setState] = useState<EmploymentState>("active");
  const [loading, setLoading] = useState(true);
  const [checklist, setChecklist] = useState<OnboardingChecklistStatusDto | OffboardingChecklistStatusDto | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      setUser(getSessionUser());
      setLoading(false);
      return;
    }
    try {
      const [me, team] = await Promise.all([
        fetchCurrentUser(token),
        fetchMyTeamContext(token).catch(() => null)
      ]);
      setUser(me);
      setTeam(team);
      const employment = team?.employmentState ?? me.employmentState ?? "active";
      setState(employment);
      if (employment === "hr_onboarding") {
        const cl = await fetchMyOnboardingChecklist(token);
        setChecklist(cl);
      } else if (employment === "offboarding") {
        const cl = await fetchMyOffboardingChecklist(token);
        setChecklist(cl);
      } else {
        setChecklist(null);
      }
    } catch (e) {
      setUser(getSessionUser());
      setState(getSessionUser()?.employmentState ?? "active");
      setErr(e instanceof Error ? e.message : "Caricamento non riuscito");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const headline = STATE_HEADLINE[state];

  async function toggleOffboardItem(itemId: string, done: boolean): Promise<void> {
    const token = getToken();
    if (!token) return;
    setBusyItem(itemId);
    setErr(null);
    try {
      const updated = await patchMyOffboardingChecklistItem(token, itemId, done);
      setChecklist(updated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Aggiornamento non riuscito");
    } finally {
      setBusyItem(null);
    }
  }

  async function finishOffboarding(): Promise<void> {
    const token = getToken();
    if (!token) return;
    setCompleting(true);
    setErr(null);
    try {
      await completeMyOffboarding(token);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Conclusione non riuscita");
    } finally {
      setCompleting(false);
    }
  }

  async function toggleItem(itemId: string, done: boolean): Promise<void> {
    const token = getToken();
    if (!token) return;
    setBusyItem(itemId);
    setErr(null);
    try {
      const updated = await patchMyOnboardingChecklistItem(token, itemId, done);
      setChecklist(updated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Aggiornamento non riuscito");
    } finally {
      setBusyItem(null);
    }
  }

  async function finishOnboarding(): Promise<void> {
    const token = getToken();
    if (!token) return;
    setCompleting(true);
    setErr(null);
    try {
      await completeMyOnboarding(token);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Conclusione non riuscita");
    } finally {
      setCompleting(false);
    }
  }

  return (
    <NexaHrAppPage eyebrow="Percorso" title={headline.title} subtitle={headline.blurb}>
      {loading ? (
        <p className="text-sm text-[var(--prom-muted)]">Caricamento stato…</p>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-[var(--prom-muted)]">
            Profilo: <span className="font-medium text-[var(--prom-text)]">{user?.fullName ?? "—"}</span>
          </p>
          {team?.onboardingBuddy ? (
            <section className="rounded-xl border border-[#002D72]/30 bg-[color-mix(in_srgb,#002D72_6%,transparent)] px-4 py-3 dark:border-sky-400/25">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#002D72] dark:text-sky-200">
                Buddy onboarding
              </p>
              <p className="mt-1 text-sm text-[var(--prom-text)]">
                <EmployeeLink userId={team.onboardingBuddy.id} label={team.onboardingBuddy.fullName} className="font-medium" />
              </p>
              {team.onboardingBuddy.aiRationale || team.onboardingBuddy.matchReason ? (
                <p className="mt-1 text-xs text-[var(--prom-muted)]">
                  {team.onboardingBuddy.aiRationale ?? team.onboardingBuddy.matchReason}
                </p>
              ) : null}
              <Link
                href={"/il-mio-team" as Route}
                className="mt-2 inline-block text-xs font-medium text-[#002D72] underline-offset-2 hover:underline dark:text-sky-200"
              >
                Vedi in Il mio team →
              </Link>
            </section>
          ) : null}
          {err ? <p className="text-sm text-rose-600">{err}</p> : null}

          {state === "hr_onboarding" && checklist ? (
            <>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-[var(--prom-muted)]">
                  <span>Progresso onboarding</span>
                  <span>{checklist.progressPercent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    className="h-full rounded-full bg-[#002D72] transition-all dark:bg-sky-500"
                    style={{ width: `${checklist.progressPercent}%` }}
                  />
                </div>
              </div>
              <ol className="space-y-3">
                {checklist.checklist.map((item, idx) => {
                  const href = ITEM_HREF[item.id];
                  const canToggle = item.id.startsWith("emp-");
                  return (
                    <li
                      key={item.id}
                      className="flex gap-3 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_92%,transparent)] px-4 py-3"
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                          item.done
                            ? "bg-emerald-600/20 text-emerald-800 dark:text-emerald-200"
                            : "bg-[color-mix(in_srgb,#002D72_12%,transparent)] text-[#002D72] dark:text-sky-200"
                        }`}
                        aria-hidden
                      >
                        {item.done ? "✓" : idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {canToggle ? (
                            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--prom-text)]">
                              <input
                                type="checkbox"
                                checked={item.done}
                                disabled={busyItem === item.id}
                                onChange={(e) => void toggleItem(item.id, e.target.checked)}
                              />
                              {item.label}
                            </label>
                          ) : href ? (
                            <Link
                              href={href}
                              scroll={false}
                              className="text-sm font-medium text-[#002D72] underline-offset-2 hover:underline dark:text-sky-200"
                            >
                              {item.label}
                            </Link>
                          ) : (
                            <span className="text-sm font-medium text-[var(--prom-text)]">{item.label}</span>
                          )}
                          {!canToggle ? (
                            <span className="text-[10px] uppercase tracking-wide text-[var(--prom-muted)]">HR</span>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
              {checklist.allStepsDone && checklist.phase !== "completed" ? (
                <Button type="button" disabled={completing} onClick={() => void finishOnboarding()}>
                  {completing ? "Conclusione…" : "Concludi onboarding"}
                </Button>
              ) : null}
              {checklist.phase === "completed" ? (
                <p className="text-sm text-emerald-700 dark:text-emerald-300">
                  Onboarding concluso. Benvenuto in azienda!
                </p>
              ) : null}
            </>
          ) : null}

          {state === "offboarding" && checklist ? (
            <>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-[var(--prom-muted)]">
                  <span>Progresso uscita</span>
                  <span>{checklist.progressPercent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    className="h-full rounded-full bg-[#002D72] transition-all dark:bg-sky-500"
                    style={{ width: `${checklist.progressPercent}%` }}
                  />
                </div>
              </div>
              <ol className="space-y-3">
                {checklist.checklist.map((item, idx) => {
                  const href = ITEM_HREF[item.id];
                  const canToggle = item.id.startsWith("emp-");
                  return (
                    <li
                      key={item.id}
                      className="flex gap-3 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_92%,transparent)] px-4 py-3"
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                          item.done
                            ? "bg-emerald-600/20 text-emerald-800 dark:text-emerald-200"
                            : "bg-[color-mix(in_srgb,#002D72_12%,transparent)] text-[#002D72] dark:text-sky-200"
                        }`}
                        aria-hidden
                      >
                        {item.done ? "✓" : idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {canToggle ? (
                            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--prom-text)]">
                              <input
                                type="checkbox"
                                checked={item.done}
                                disabled={busyItem === item.id}
                                onChange={(e) => void toggleOffboardItem(item.id, e.target.checked)}
                              />
                              {item.label}
                            </label>
                          ) : href ? (
                            <Link
                              href={href}
                              scroll={false}
                              className="text-sm font-medium text-[#002D72] underline-offset-2 hover:underline dark:text-sky-200"
                            >
                              {item.label}
                            </Link>
                          ) : (
                            <span className="text-sm font-medium text-[var(--prom-text)]">{item.label}</span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
              {checklist.allStepsDone && checklist.phase !== "completed" ? (
                <Button type="button" disabled={completing} onClick={() => void finishOffboarding()}>
                  {completing ? "Conferma…" : "Conferma passi completati"}
                </Button>
              ) : null}
              {checklist.wizardCompleted ? (
                <p className="text-sm text-emerald-700 dark:text-emerald-300">
                  HR ha chiuso la procedura di offboarding. Grazie per la collaborazione.
                </p>
              ) : null}
              {checklist.phase === "completed" && !checklist.wizardCompleted ? (
                <p className="text-sm text-emerald-700 dark:text-emerald-300">
                  Hai completato tutti i passi del percorso di uscita.
                </p>
              ) : null}
            </>
          ) : state === "offboarding" ? (
            <p className="text-sm text-[var(--prom-muted)]">Caricamento checklist offboarding…</p>
          ) : null}

          {state === "active" ? (
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <Link
                href={"/percorso/formazione" as Route}
                className="font-medium text-[#002D72] underline-offset-2 hover:underline dark:text-sky-200"
              >
                Vai alla formazione assegnata →
              </Link>
              <Link
                href={"/percorso/documenti" as Route}
                className="font-medium text-[#002D72] underline-offset-2 hover:underline dark:text-sky-200"
              >
                Documenti da firmare →
              </Link>
            </p>
          ) : null}
        </div>
      )}
    </NexaHrAppPage>
  );
}
