"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NexaPageHelpButton } from "@/components/nexa-page-help-button";
import {
  downloadPayslipPdf,
  fetchCurrentUser,
  fetchPayslips,
  markPayslipReadApi,
  postPayslipExplain,
  type Payslip,
  type PayslipExplainResult
} from "@/lib/api";
import { getToken, getSessionUser, type SessionUser } from "@/lib/auth-session";
import { payslipDisplayCurrency } from "@/lib/nexa-swiss-payroll-flag";

function isAddizionaleLine(line: { code: string; description: string }): boolean {
  const s = `${line.code} ${line.description}`;
  return /addiz|add\.|irpef.*reg|irpef.*com|comunale|regione|municip|provinc/i.test(s);
}

function signalClass(signal: string): string {
  const s = signal.toLowerCase();
  if (s === "verify") return "border-amber-400/40 bg-amber-500/10 text-amber-900 dark:text-amber-100";
  if (s === "ok") return "border-emerald-400/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100";
  return "border-sky-400/35 bg-sky-500/10 text-sky-900 dark:text-sky-100";
}

function bulletsFromEnvelope(env: NonNullable<PayslipExplainResult["envelope"]>): string[] {
  const out: string[] = [];
  if (env.keyPoints?.length) {
    out.push(...env.keyPoints);
  } else if (env.plainSummary) {
    out.push(env.plainSummary);
  }
  return out.slice(0, 6);
}

function ExplainBulletSection({
  title,
  bullets,
  fallback
}: {
  title: string;
  bullets?: string[];
  fallback?: string;
}): React.JSX.Element | null {
  const items =
    bullets && bullets.length > 0
      ? bullets
      : fallback
        ? fallback
            .split(/\n+/)
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 6)
        : [];
  if (items.length === 0) return null;
  return (
    <section className="rounded-xl border border-[var(--prom-line)] bg-[var(--card-bg)]/90 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#002D72] dark:text-sky-300">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm leading-snug text-[var(--prom-text)]">
        {items.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#002D72] dark:bg-sky-400" aria-hidden />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function PayslipsPage(): React.JSX.Element {
  const [items, setItems] = useState<Payslip[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [month, setMonth] = useState<string>("");
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Payslip | null>(null);
  const [showLines, setShowLines] = useState(false);
  const [explainBusy, setExplainBusy] = useState(false);
  const [explainErr, setExplainErr] = useState<string | null>(null);
  const [explain, setExplain] = useState<PayslipExplainResult | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const me = await fetchCurrentUser(token).catch(() => getSessionUser() as SessionUser);
      setUser(me ?? getSessionUser());
      const list = await fetchPayslips(token, { months: 12 });
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return items.filter((p) => {
      const [y, m] = p.period.split("-");
      if (year && y !== year) return false;
      if (month && m !== month.padStart(2, "0") && m !== month) return false;
      return true;
    });
  }, [items, year, month]);

  useEffect(() => {
    if (selected && !filtered.some((p) => p.id === selected.id)) {
      setSelected(null);
      setExplain(null);
      setShowLines(false);
    }
  }, [filtered, selected]);

  async function onDownload(p: Payslip): Promise<void> {
    const token = getToken();
    if (!token || !user) return;
    await downloadPayslipPdf(token, p.userId, p.period);
    if (p.isNew) {
      await markPayslipReadApi(token, p.id);
      setItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, isNew: false } : x)));
    }
  }

  async function onExplain(p: Payslip): Promise<void> {
    const token = getToken();
    if (!token) return;
    setSelected(p);
    setShowLines(false);
    setExplainBusy(true);
    setExplainErr(null);
    setExplain(null);
    try {
      const r = await postPayslipExplain(token, p.id);
      setExplain(r);
    } catch (e) {
      setExplainErr(e instanceof Error ? e.message : "Spiegazione non disponibile");
    } finally {
      setExplainBusy(false);
    }
  }

  const payslipCurrency = payslipDisplayCurrency();

  const years = useMemo(() => {
    const ys = new Set(items.map((p) => p.period.slice(0, 4)));
    ys.add(String(new Date().getFullYear()));
    return [...ys].sort((a, b) => b.localeCompare(a));
  }, [items]);

  const selectedLines = selected?.lines ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-[var(--prom-line)] bg-gradient-to-br from-[color-mix(in_srgb,#002D72_8%,transparent)] to-[var(--prom-surface)]/60 p-5 shadow-sm">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#002D72] dark:text-sky-300">
            Retribuzione
          </p>
          <h1 className="mt-1 font-synapse text-2xl font-semibold text-[var(--prom-text)]">Cedolini</h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--prom-muted)]">
            Solo i tuoi cedolini pubblicati. L&apos;analisi AI commenta le voci del periodo selezionato — non è parere
            fiscale.
          </p>
        </div>
        <NexaPageHelpButton pageKey="payslips" />
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface)]/70 p-4">
        <label className="text-sm text-[var(--prom-muted)]">
          Anno
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="ml-2 rounded-lg border border-[var(--prom-line-strong)] bg-transparent px-2 py-1.5 text-[var(--prom-text)]"
          >
            <option value="">Tutti</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-[var(--prom-muted)]">
          Mese
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="ml-2 rounded-lg border border-[var(--prom-line-strong)] bg-transparent px-2 py-1.5 text-[var(--prom-text)]"
          >
            <option value="">Tutti</option>
            {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? <p className="text-sm text-[var(--prom-muted)]">Caricamento…</p> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Periodi</h2>
          {filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--prom-line)] p-6 text-sm text-[var(--prom-muted)]">
              Nessun cedolino per i filtri scelti.
            </p>
          ) : (
            filtered.map((p) => {
              const active = selected?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelected(p);
                    setExplain(null);
                    setExplainErr(null);
                    setShowLines(false);
                  }}
                  className={[
                    "w-full rounded-xl border px-4 py-3 text-left transition",
                    active
                      ? "border-[#002D72]/50 bg-[color-mix(in_srgb,#002D72_10%,transparent)] ring-1 ring-[#002D72]/25"
                      : "border-[var(--prom-line)] bg-[var(--card-bg)] hover:border-[color-mix(in_srgb,#002D72_30%,var(--prom-line))]"
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--prom-text)]">{p.period}</span>
                    {p.isNew ? (
                      <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
                        Nuovo
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-[var(--prom-muted)]">
                    Netto {payslipCurrency} {p.netSalary?.toFixed?.(2) ?? p.netSalary}
                    {(p.lines?.length ?? 0) > 0 ? ` · ${p.lines!.length} righe` : ""}
                  </p>
                </button>
              );
            })
          )}
        </div>

        <div className="min-h-[280px] rounded-2xl border border-[var(--prom-line)] bg-[var(--card-bg)] p-4 shadow-sm">
          {!selected ? (
            <p className="py-12 text-center text-sm text-[var(--prom-muted)]">
              Seleziona un periodo per vedere dettaglio, righe e analisi.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--prom-line)] pb-4">
                <div>
                  <p className="text-lg font-semibold text-[var(--prom-text)]">{selected.period}</p>
                  <p className="text-sm text-[var(--prom-muted)]">
                    Lordo {payslipCurrency} {selected.grossSalary?.toFixed?.(2) ?? "—"} · Netto{" "}
                    {payslipCurrency} {selected.netSalary?.toFixed?.(2) ?? "—"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" className="gap-2" onClick={() => void onDownload(selected)}>
                    <FileDown className="h-4 w-4" />
                    PDF
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowLines((v) => !v)}
                  >
                    {showLines ? "Nascondi righe" : "Vedi righe"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-2 border border-[#002D72]/40 bg-[#002D72] text-white hover:bg-[#003d96]"
                    onClick={() => void onExplain(selected)}
                    disabled={explainBusy}
                  >
                    <Sparkles className="h-4 w-4" />
                    {explainBusy ? "Analisi…" : "Analizza il mio cedolino"}
                  </Button>
                </div>
              </div>

              {showLines ? (
                <div className="max-h-48 overflow-auto rounded-lg border border-[var(--prom-line)]">
                  {selectedLines.length === 0 ? (
                    <p className="p-3 text-xs text-[var(--prom-muted)]">Nessuna riga strutturata — apri il PDF.</p>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-[var(--prom-surface)] text-[var(--prom-muted)]">
                        <tr>
                          <th className="px-2 py-1">Cod.</th>
                          <th className="px-2 py-1">Voce</th>
                          <th className="px-2 py-1 text-right">€</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedLines.map((line) => (
                          <tr
                            key={`${line.code}-${line.description}`}
                            className={isAddizionaleLine(line) ? "bg-amber-500/10" : ""}
                          >
                            <td className="px-2 py-1 font-mono">{line.code}</td>
                            <td className="px-2 py-1">{line.description}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{line.amount?.toFixed?.(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : null}

              {explainErr ? <p className="text-sm text-rose-600">{explainErr}</p> : null}

              {explain?.envelope ? (
                <div className="space-y-3">
                  <ExplainBulletSection
                    title="In sintesi (solo il tuo cedolino)"
                    bullets={bulletsFromEnvelope(explain.envelope)}
                  />
                  <ExplainBulletSection
                    title="Trattenute"
                    bullets={explain.envelope.withholdingsBullets}
                    fallback={explain.envelope.withholdingsExplanation}
                  />
                  <ExplainBulletSection
                    title="Come leggerlo"
                    bullets={explain.envelope.howToReadBullets}
                    fallback={explain.envelope.howToReadPayslip}
                  />
                  <ExplainBulletSection
                    title="Voci del periodo"
                    bullets={explain.envelope.parsedLineBullets}
                    fallback={explain.envelope.parsedPayslipAnalysis}
                  />
                  {explain.envelope.lineHighlights && explain.envelope.lineHighlights.length > 0 ? (
                    <ul className="space-y-1.5">
                      {explain.envelope.lineHighlights.slice(0, 6).map((h) => (
                        <li
                          key={h.lineRef + h.comment}
                          className={`rounded-lg border px-2.5 py-2 text-xs ${signalClass(h.signal)}`}
                        >
                          <span className="font-semibold uppercase">{h.signal}</span> · {h.lineRef}: {h.comment}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {explain.envelope.closingTip ? (
                    <p className="text-xs text-[var(--prom-muted)]">{explain.envelope.closingTip}</p>
                  ) : null}
                  <p className="text-[10px] text-[var(--prom-muted)]">
                    Analisi sul periodo {explain.period}. Non sostituisce busta paga ufficiale o consulenza fiscale.
                  </p>
                </div>
              ) : explainBusy ? (
                <p className="text-sm text-[var(--prom-muted)]">Preparo i punti chiave sul tuo cedolino…</p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
