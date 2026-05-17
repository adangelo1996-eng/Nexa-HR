"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NexaHrAppPage } from "@/components/nexa-hr-app-page";
import { fetchCurrentUser, fetchMyTeamContext } from "@/lib/api";
import { getSessionUser, getToken, type SessionUser } from "@/lib/auth-session";

type EmploymentState = "active" | "hr_onboarding" | "offboarding";

type ChecklistItem = { id: string; label: string; href?: Route; done?: boolean };

function buildChecklist(state: EmploymentState): ChecklistItem[] {
  if (state === "hr_onboarding") {
    return [
      { id: "welcome", label: "Leggi il messaggio di benvenuto", href: "/welcome" as Route },
      { id: "settings", label: "Completa profilo e recapiti", href: "/settings" as Route },
      { id: "payslips", label: "Verifica accesso cedolini", href: "/payslips" as Route },
      { id: "policies", label: "Consulta policy aziendali (se disponibili)" },
      { id: "team", label: "Conosci manager e team", href: "/il-mio-team" as Route },
      { id: "formazione", label: "Completa i corsi di formazione", href: "/percorso/formazione" as Route }
    ];
  }
  if (state === "offboarding") {
    return [
      { id: "workflow", label: "Chiudi richieste workflow aperte", href: "/workflow" as Route },
      { id: "expenses", label: "Invia note spese in sospeso", href: "/expenses" as Route },
      { id: "payslips", label: "Scarica ultimi cedolini", href: "/payslips" as Route },
      { id: "settings", label: "Aggiorna recapiti per comunicazioni finali", href: "/settings" as Route },
      { id: "team", label: "Allinea passaggio con il manager", href: "/il-mio-team" as Route }
    ];
  }
  return [
    { id: "dashboard", label: "Dashboard operativa aggiornata", href: "/" as Route, done: true },
    { id: "attendance", label: "Timbrature e presenze in regola", href: "/attendance" as Route },
    { id: "team", label: "Rubrica team di riferimento", href: "/il-mio-team" as Route }
  ];
}

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
  const [state, setState] = useState<EmploymentState>("active");
  const [loading, setLoading] = useState(true);

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
      setState(team?.employmentState ?? me.employmentState ?? "active");
    } catch {
      setUser(getSessionUser());
      setState(getSessionUser()?.employmentState ?? "active");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const headline = STATE_HEADLINE[state];
  const checklist = useMemo(() => buildChecklist(state), [state]);

  return (
    <NexaHrAppPage eyebrow="Percorso" title={headline.title} subtitle={headline.blurb}>
      {loading ? (
        <p className="text-sm text-[var(--prom-muted)]">Caricamento stato…</p>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-[var(--prom-muted)]">
            Profilo: <span className="font-medium text-[var(--prom-text)]">{user?.fullName ?? "—"}</span>
          </p>
          <p className="text-sm">
            <Link
              href={"/percorso/formazione" as Route}
              className="font-medium text-[#002D72] underline-offset-2 hover:underline dark:text-sky-200"
            >
              Vai alla formazione assegnata →
            </Link>
          </p>
          <ol className="space-y-3">
            {checklist.map((item, idx) => (
              <li
                key={item.id}
                className="flex gap-3 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_92%,transparent)] px-4 py-3"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,#002D72_12%,transparent)] text-xs font-semibold text-[#002D72] dark:text-sky-200"
                  aria-hidden
                >
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  {item.href ? (
                    <Link
                      href={item.href}
                      scroll={false}
                      className="text-sm font-medium text-[#002D72] underline-offset-2 hover:underline dark:text-sky-200"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium text-[var(--prom-text)]">{item.label}</span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </NexaHrAppPage>
  );
}
