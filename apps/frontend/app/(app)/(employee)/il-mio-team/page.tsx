"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { NexaHrAppPage } from "@/components/nexa-hr-app-page";
import { EmployeeLink } from "@/components/nexa-entity-links";
import { fetchMyTeamContext, type TeamContextDto } from "@/lib/api";
import { getToken } from "@/lib/auth-session";

function PersonList(props: {
  title: string;
  people: Array<{ id: string; fullName: string }>;
  empty: string;
  highlight?: boolean;
  subtitle?: string;
}): React.JSX.Element {
  const { title, people, empty, highlight, subtitle } = props;
  return (
    <section
      className={`rounded-2xl border p-4 ${
        highlight
          ? "border-[#002D72]/40 bg-[color-mix(in_srgb,#002D72_8%,var(--card-bg))] dark:border-sky-400/30"
          : "border-[var(--card-border)]"
      }`}
      style={{ background: highlight ? undefined : "var(--card-bg)" }}
    >
      <h2 className="text-sm font-semibold text-[var(--prom-text)]">{title}</h2>
      {subtitle ? <p className="mt-1 text-xs text-[var(--prom-muted)]">{subtitle}</p> : null}
      {people.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--prom-muted)]">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {people.map((p) => (
            <li key={p.id}>
              <EmployeeLink userId={p.id} label={p.fullName} className="text-sm font-medium" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const STATE_LABEL: Record<TeamContextDto["employmentState"], string> = {
  active: "In forza",
  hr_onboarding: "Onboarding HR",
  offboarding: "Uscita in corso"
};

export default function IlMioTeamPage(): React.JSX.Element {
  const [ctx, setCtx] = useState<TeamContextDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setCtx(await fetchMyTeamContext(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossibile caricare il team");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <NexaHrAppPage
      eyebrow="Persone"
      title="Il mio team"
      subtitle="Manager, colleghi dello stesso riporto e collaboratori diretti. Non include l'organigramma completo dell'azienda."
    >
      <p className="mb-4 text-sm text-[var(--prom-muted)]">
        Per la struttura aziendale completa, gli utenti HR usano{" "}
        <Link href="/organigramma" className="font-medium text-[#002D72] underline-offset-2 hover:underline dark:text-sky-200">
          Organigramma strutturale
        </Link>
        . Come dipendente vedi solo questo perimetro.
      </p>
      {error ? (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="text-sm text-[var(--prom-muted)]">Caricamento…</p>
      ) : ctx ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--prom-muted)]">
            Stato lavorativo:{" "}
            <span className="font-medium text-[var(--prom-text)]">{STATE_LABEL[ctx.employmentState]}</span>
          </p>
          <PersonList
            title="Manager diretto"
            people={ctx.manager ? [ctx.manager] : []}
            empty="Nessun manager assegnato in anagrafica."
          />
          {ctx.onboardingBuddy ? (
            <PersonList
              title="Buddy onboarding"
              highlight
              subtitle={
                ctx.onboardingBuddy.aiRationale
                  ? ctx.onboardingBuddy.aiRationale
                  : ctx.onboardingBuddy.matchReason ?? "Referente per il tuo ingresso in azienda."
              }
              people={[ctx.onboardingBuddy]}
              empty=""
            />
          ) : null}
          <PersonList title="Colleghi (stesso manager)" people={ctx.peers} empty="Nessun collega nel perimetro." />
          <PersonList
            title="Collaboratori diretti"
            people={ctx.directReports}
            empty="Non risulti manager di altre persone."
          />
        </div>
      ) : null}
    </NexaHrAppPage>
  );
}
