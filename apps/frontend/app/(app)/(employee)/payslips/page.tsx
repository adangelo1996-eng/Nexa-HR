"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  if (s === "verify") return "text-amber-700 dark:text-amber-200";
  if (s === "ok") return "text-emerald-700 dark:text-emerald-300";
  return "text-sky-800 dark:text-sky-200/90";
}

export default function PayslipsPage(): React.JSX.Element {
  const [items, setItems] = useState<Payslip[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [month, setMonth] = useState<string>("");
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Payslip | null>(null);
  const [explainBusy, setExplainBusy] = useState(false);
  const [explainErr, setExplainErr] = useState<string | null>(null);
  const [explain, setExplain] = useState<PayslipExplainResult | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      return;
    }
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
      if (year && y !== year) {
        return false;
      }
      if (month && m !== month.padStart(2, "0") && m !== month) {
        return false;
      }
      return true;
    });
  }, [items, year, month]);

  useEffect(() => {
    if (selected && !filtered.some((p) => p.id === selected.id)) {
      setSelected(null);
      setExplain(null);
    }
  }, [filtered, selected]);

  async function onDownload(p: Payslip): Promise<void> {
    const token = getToken();
    if (!token || !user) {
      return;
    }
    await downloadPayslipPdf(token, p.userId, p.period);
    if (p.isNew) {
      await markPayslipReadApi(token, p.id);
      setItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, isNew: false } : x)));
    }
  }

  async function onExplain(p: Payslip): Promise<void> {
    const token = getToken();
    if (!token) return;
    setExplainBusy(true);
    setExplainErr(null);
    setExplain(null);
    setSelected(p);
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

  const residenceBlock = useMemo(() => {
    if (!user) return null;
    const com = user.taxMunicipalityIt?.trim();
    const reg = user.taxRegion?.trim();
    const dom = user.taxDomicileMunicipalityIt?.trim();
    const same = user.taxDomicileSameAsResidence !== false;
    return (
      <ul className="list-inside list-disc text-sm text-[var(--prom-muted)]">
        <li>
          <span className="text-[var(--prom-text)]">Comune/area fiscale (stipendio): </span>
          {[com, reg].filter(Boolean).join(" · ") || "— (completa in Profilo o chiedi a HR)"}
        </li>
        <li>
          <span className="text-[var(--prom-text)]">Domicilio fiscale: </span>
          {same ? "Allineato alla residenza, come da profilo" : dom || "—"}
        </li>
        {user.fiscalCode ? (
          <li>
            <span className="text-[var(--prom-text)]">Codice fiscale: </span>presente in anagrafica
          </li>
        ) : null}
        {user.ccnlCode || user.ccnlLevel ? (
          <li>
            <span className="text-[var(--prom-text)]">CCNL / livello: </span>
            {[user.ccnlCode, user.ccnlLevel].filter(Boolean).join(" · ")}
          </li>
        ) : null}
      </ul>
    );
  }, [user]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-[var(--prom-text)]">Cedolini</h1>
        <p className="text-sm text-[var(--prom-muted)]">
          Ultimi 12 mesi. Vedi solo i cedolini che l&apos;HR ha pubblicato per te (le bozze restano nella console
          payroll). Residenza e addizionali: confronta con le righe sotto; la spiegazione semplice è generata da
          un assistente (non è parere fiscale).
        </p>
      </header>

      <div className="rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)]/80 p-4">
        <h2 className="text-sm font-semibold text-[var(--prom-text)]">Dati fiscali da anagrafica (residenza / CCNL)</h2>
        <p className="mt-1 text-xs text-[var(--prom-muted)]">Usati per contestualizzare addizionali e trattenute. Aggiornali in Impostazioni se HR lo consente.</p>
        <div className="mt-2">{residenceBlock}</div>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="text-sm text-[var(--prom-muted)]">
          Anno
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="ml-2 rounded-lg border border-[var(--prom-line-strong)] bg-transparent px-2 py-1 text-[var(--prom-text)]"
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
            className="ml-2 rounded-lg border border-[var(--prom-line-strong)] bg-transparent px-2 py-1 text-[var(--prom-text)]"
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

      <ul className="space-y-2">
        {filtered.length === 0 ? (
          <li className="text-sm text-[var(--prom-muted)]">Nessun cedolino.</li>
        ) : (
          filtered.map((p) => {
            const lines = p.lines ?? [];
            return (
              <li
                key={p.id}
                className="rounded-lg border border-[var(--prom-line)] px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="font-medium text-[var(--prom-text)]">{p.period}</span>
                    {p.isNew ? (
                      <span className="ml-2 rounded bg-rose-600/90 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
                        Nuovo
                      </span>
                    ) : null}
                    <p className="text-xs text-[var(--prom-muted)]">
                      Netto: {payslipCurrency} {p.netSalary?.toFixed?.(2) ?? p.netSalary}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void onDownload(p)}
                      className="gap-2"
                    >
                      <FileDown className="h-4 w-4" />
                      PDF
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => {
                        setSelected(p);
                        setExplain(null);
                        setExplainErr(null);
                      }}
                    >
                      Dettaglio righe
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="gap-2 border border-[#002D72]/40"
                      onClick={() => void onExplain(p)}
                      disabled={explainBusy}
                    >
                      <Sparkles className="h-4 w-4" />
                      {explainBusy && selected?.id === p.id ? "…" : "Spiegazione semplice (AI)"}
                    </Button>
                  </div>
                </div>

                {selected?.id === p.id ? (
                  <div className="mt-4 space-y-3 border-t border-[var(--prom-line)] pt-3 text-sm">
                    <p className="text-xs font-medium uppercase text-[var(--prom-muted)]">Righe cedolino</p>
                    {lines.length === 0 ? (
                      <p className="text-xs text-[var(--prom-muted)]">Nessuna riga in elenco (solo totali). Apri il PDF per il dettaglio.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[28rem] text-left text-xs">
                          <thead>
                            <tr className="text-[var(--prom-muted)]">
                              <th className="py-1 pr-2">Codice</th>
                              <th className="py-1 pr-2">Descrizione</th>
                              <th className="py-1 text-right">Importo</th>
                              <th className="py-1 pl-2">Addizionali / IRPEF</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lines.map((line) => {
                              const add = isAddizionaleLine(line);
                              return (
                                <tr key={`${p.id}-${line.code}-${line.description}`} className={add ? "bg-amber-500/10" : ""}>
                                  <td className="py-1 pr-2 font-mono text-[10px] text-[var(--prom-text)]">{line.code}</td>
                                  <td className="py-1 pr-2 text-[var(--prom-text)]">{line.description}</td>
                                  <td className="py-1 text-right text-[var(--prom-text)]">{line.amount?.toFixed?.(2) ?? line.amount}</td>
                                  <td className="py-1 pl-2 text-[var(--prom-muted)]">{add ? "Sì (verifica in CUD)" : "—"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {explainErr && selected.id === p.id ? (
                      <p className="text-sm text-rose-600">{explainErr}</p>
                    ) : null}

                    {explain && selected.id === p.id && explain.envelope ? (
                      <div className="space-y-3 rounded-lg border border-[#002D72]/30 bg-white/[0.04] p-3 text-sm text-[var(--prom-text)]">
                        {explain.residenceSummary ? (
                          <p>
                            <span className="font-medium text-[#002D72] dark:text-sky-300">Anagrafica / residenza: </span>
                            {explain.residenceSummary}
                          </p>
                        ) : null}
                        {explain.addizionaliFromLines.length > 0 ? (
                          <div>
                            <p className="font-medium text-[#002D72] dark:text-sky-300">Voci con possibili addizionali (euristiche)</p>
                            <ul className="list-inside list-disc text-[var(--prom-muted)]">
                              {explain.addizionaliFromLines.map((x) => (
                                <li key={x.code + x.description}>
                                  {x.code} — {x.description}: {payslipCurrency} {x.amount.toFixed(2)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {explain.envelope.plainSummary ? <p className="leading-relaxed whitespace-pre-wrap">{explain.envelope.plainSummary}</p> : null}
                        {explain.envelope.residenceDomicileNote ? (
                          <p className="text-[var(--prom-muted)]">
                            <span className="font-medium text-[var(--prom-text)]">Residenza e domicilio: </span>
                            {explain.envelope.residenceDomicileNote}
                          </p>
                        ) : null}
                        {explain.envelope.addizionaliNote ? (
                          <p className="text-[var(--prom-muted)]">
                            <span className="font-medium text-[var(--prom-text)]">Addizionali: </span>
                            {explain.envelope.addizionaliNote}
                          </p>
                        ) : null}
                        {explain.envelope.lineHighlights && explain.envelope.lineHighlights.length > 0 ? (
                          <ul className="space-y-1.5">
                            {explain.envelope.lineHighlights.map((h) => (
                              <li
                                key={h.lineRef + h.comment}
                                className={`rounded border border-[var(--prom-line)] px-2 py-1.5 text-xs ${signalClass(h.signal)}`}
                              >
                                <span className="font-medium uppercase">{h.signal}</span> · {h.lineRef}: {h.comment}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {explain.envelope.closingTip ? <p className="text-xs text-[var(--prom-muted)]">{explain.envelope.closingTip}</p> : null}
                        <p className="text-[10px] text-[var(--prom-muted)]">
                          LLM: {explain.llm.active ? "attivo" : "disattivo"} · output strutturato: {explain.llm.refineApplied ? "sì" : "no"}.{" "}
                          Non sostituisce consulenza fiscale o busta paga ufficiale.
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
