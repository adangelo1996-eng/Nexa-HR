"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchHrRecapSummary, type HrRecapSummaryDto } from "@/lib/api";
import { getToken } from "@/lib/auth-session";

export default function OffboardPage(): React.JSX.Element {
  const [summary, setSummary] = useState<HrRecapSummaryDto | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    void fetchHrRecapSummary(token)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-[var(--prom-text)]">Offboarding dipendenti</h1>
        <p className="mt-2 text-sm text-[var(--prom-muted)]">
          Avvia la procedura guidata di uscita da scheda dipendente, recap HR o organigramma. Il wizard copre preavviso,
          documenti, revoca accessi, payroll e chiusura formazione.
        </p>
      </header>

      <div className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] p-4 text-sm">
        <p className="font-medium text-[var(--prom-text)]">In offboarding</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{summary?.offboarding ?? "—"}</p>
        <Link
          href={"/hr-recap" as Route}
          className="mt-3 inline-block text-[#002D72] underline-offset-2 hover:underline dark:text-sky-200"
        >
          Apri recap HR →
        </Link>
      </div>

      <p className="text-xs text-[var(--prom-muted)]">
        Per avviare un nuovo offboarding, apri il profilo di un dipendente attivo e seleziona «Avvia offboarding».
      </p>
    </div>
  );
}
