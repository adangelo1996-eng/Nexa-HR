"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  downloadPayslipPdf,
  fetchCurrentUser,
  fetchPayslipDrafts,
  fetchUsers,
  generatePayslip,
  postHebbSimulateIt,
  postPayrollBatchGenerate,
  publishPayrollPeriod,
  type HebbSimulatePayrollResult,
  type PayrollBatchRowResult,
  type Payslip,
  type User
} from "@/lib/api";
import {
  clearSession,
  getToken,
  getSessionUser,
  sessionCanAccessPayrollArea,
  type SessionUser
} from "@/lib/auth-session";
import { payslipDisplayCurrency } from "@/lib/nexa-swiss-payroll-flag";
import { Button } from "@/components/ui/button";
import { DraftPayslipPreviewDialog } from "./draft-payslip-preview-dialog";

function formatEuro(n: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

function payrollUserDropdownList(me: SessionUser, fromApi: User[]): User[] {
  if (fromApi.length > 0) {
    return fromApi;
  }
  return [
    {
      id: me.id,
      email: me.email,
      fullName: me.fullName,
      role: me.role,
      companyId: me.companyId ?? ""
    }
  ];
}

export default function PayrollHebbPage(): React.JSX.Element | null {
  const router = useRouter();
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const [simPeriod, setSimPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [simPrevMonth, setSimPrevMonth] = useState(false);
  const [simResult, setSimResult] = useState<HebbSimulatePayrollResult | null>(null);
  const [simShowJson, setSimShowJson] = useState(false);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  const [singleUsers, setSingleUsers] = useState<User[]>([]);
  const [singleUserId, setSingleUserId] = useState("");
  const [singlePeriod, setSinglePeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [singleResult, setSingleResult] = useState<Payslip | null>(null);
  const [singleLoading, setSingleLoading] = useState(true);
  const [singleSubmitting, setSingleSubmitting] = useState(false);
  const [singleError, setSingleError] = useState<string | null>(null);
  const [singleOkMsg, setSingleOkMsg] = useState<string | null>(null);

  const [batchPeriod, setBatchPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [batchPrevMonth, setBatchPrevMonth] = useState(true);
  const [batchResults, setBatchResults] = useState<PayrollBatchRowResult[] | null>(null);
  const [drafts, setDrafts] = useState<Payslip[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [publishMsg, setPublishMsg] = useState<string | null>(null);
  const [previewDraft, setPreviewDraft] = useState<Payslip | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setToken(t);
    void fetchCurrentUser(t)
      .then((u) => {
        setSessionUser(u);
        if (!sessionCanAccessPayrollArea(u)) {
          router.replace("/");
        }
      })
      .catch(() => {
        setSessionUser(getSessionUser());
      });
  }, [router]);

  useEffect(() => {
    const t = getToken();
    const su = sessionUser;
    if (!t || !su || !sessionCanAccessPayrollArea(su)) {
      return;
    }
    const payrollToken = t;
    const payrollSessionUser = su;
    let cancelled = false;
    async function loadSingle(): Promise<void> {
      setSingleLoading(true);
      try {
        let availableUsers: User[] = [];
        try {
          availableUsers = await fetchUsers(payrollToken);
        } catch {
          availableUsers = [];
        }
        const list = payrollUserDropdownList(payrollSessionUser, availableUsers);
        if (cancelled) return;
        setSingleUsers(list);
        setSingleUserId((prev) => (list.some((u) => u.id === prev) ? prev : (list[0]?.id ?? "")));
      } catch (e) {
        if (!cancelled) {
          clearSession();
          router.replace("/login");
          setSingleError(e instanceof Error ? e.message : "Errore caricamento");
        }
      } finally {
        if (!cancelled) setSingleLoading(false);
      }
    }
    void loadSingle();
    return () => {
      cancelled = true;
    };
  }, [router, sessionUser]);

  const loadDrafts = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) return;
    setLoadingDrafts(true);
    try {
      const [list, people] = await Promise.all([fetchPayslipDrafts(t, batchPeriod), fetchUsers(t)]);
      setDrafts(list);
      const map: Record<string, string> = {};
      for (const u of people) {
        map[u.id] = u.fullName;
      }
      setUserNames(map);
    } catch (e) {
      setBatchError(e instanceof Error ? e.message : "Errore caricamento bozze");
    } finally {
      setLoadingDrafts(false);
    }
  }, [batchPeriod]);

  useEffect(() => {
    if (!sessionUser || !sessionCanAccessPayrollArea(sessionUser)) return;
    void loadDrafts();
  }, [loadDrafts, sessionUser]);

  const selectedSingleUser = useMemo(
    () => singleUsers.find((item) => item.id === singleUserId),
    [singleUsers, singleUserId]
  );
  const payslipCurrency = payslipDisplayCurrency();

  async function onSimulate(): Promise<void> {
    const t = getToken();
    if (!t) {
      setSimError("Sessione non valida");
      return;
    }
    setSimLoading(true);
    setSimError(null);
    setSimResult(null);
    try {
      const res = await postHebbSimulateIt(t, {
        period: simPeriod,
        usePreviousMonthVariables: simPrevMonth
      });
      setSimResult(res);
    } catch (e) {
      setSimError(e instanceof Error ? e.message : "Errore simulazione");
    } finally {
      setSimLoading(false);
    }
  }

  async function onSingleGenerate(): Promise<void> {
    const t = getToken();
    if (!t || !singleUserId || !singlePeriod) return;
    setSingleSubmitting(true);
    setSingleError(null);
    setSingleOkMsg(null);
    try {
      const payslip = await generatePayslip(t, singleUserId, singlePeriod);
      setSingleResult(payslip);
      if (singlePeriod === batchPeriod) {
        await loadDrafts();
        setSingleOkMsg("Bozza salvata. Compare nell’elenco sotto; usa «Pubblica su Nexa» quando sei pronto.");
      } else {
        setSingleOkMsg(
          `Bozza salvata per ${singlePeriod}. Imposta lo stesso periodo nella sezione batch per vederla e pubblicarla.`
        );
      }
    } catch (e) {
      setSingleError(e instanceof Error ? e.message : "Errore calcolo cedolino");
    } finally {
      setSingleSubmitting(false);
    }
  }

  async function onSinglePdf(): Promise<void> {
    const t = getToken();
    if (!t || !singleUserId || !singlePeriod) return;
    try {
      await downloadPayslipPdf(t, singleUserId, singlePeriod);
    } catch (e) {
      setSingleError(e instanceof Error ? e.message : "Errore export PDF");
    }
  }

  async function onBatch(): Promise<void> {
    const t = getToken();
    if (!t) return;
    setLoadingBatch(true);
    setBatchError(null);
    setPublishMsg(null);
    setBatchResults(null);
    try {
      const { results } = await postPayrollBatchGenerate(t, {
        period: batchPeriod,
        usePreviousMonthVariables: batchPrevMonth
      });
      setBatchResults(results);
      await loadDrafts();
    } catch (e) {
      setBatchError(e instanceof Error ? e.message : "Errore batch");
    } finally {
      setLoadingBatch(false);
    }
  }

  async function onPublish(): Promise<void> {
    if (!window.confirm(`Pubblicare tutte le bozze del periodo ${batchPeriod} ai dipendenti?`)) {
      return;
    }
    const t = getToken();
    if (!t) return;
    setPublishing(true);
    setPublishMsg(null);
    setBatchError(null);
    try {
      const { updated } = await publishPayrollPeriod(t, batchPeriod);
      setPublishMsg(`Pubblicati ${updated} cedolini.`);
      setBatchResults(null);
      await loadDrafts();
    } catch (e) {
      setBatchError(e instanceof Error ? e.message : "Errore pubblicazione");
    } finally {
      setPublishing(false);
    }
  }

  async function onDraftPdf(d: Payslip): Promise<void> {
    const t = getToken();
    if (!t) return;
    setPdfLoading(true);
    try {
      await downloadPayslipPdf(t, d.userId, d.period);
    } catch (e) {
      setBatchError(e instanceof Error ? e.message : "Errore download PDF");
    } finally {
      setPdfLoading(false);
    }
  }

  function openDraftPreview(d: Payslip): void {
    setPreviewDraft(d);
    setPreviewOpen(true);
  }

  const batchAllOk =
    batchResults != null && batchResults.length > 0 && batchResults.every((r) => r.ok);
  const batchHasErrors = batchResults != null && batchResults.some((r) => !r.ok);
  const batchFailures = batchResults?.filter((r) => !r.ok) ?? [];

  if (!token || !sessionUser) {
    return (
      <div className="space-y-4">
        <p className="text-slate-700 dark:text-slate-300">Caricamento…</p>
      </div>
    );
  }

  if (!sessionCanAccessPayrollArea(sessionUser)) {
    return null;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-10 px-2 pb-10 sm:px-0">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Hebb - Payroll</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Unica area per simulazione Hebb, calcolo singolo in bozza ed elaborazione batch in bozza; la pubblicazione ai
          dipendenti è un passaggio separato.
          Valori da validare con il consulente del lavoro.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500">
          Addizionali comunali (Como) da{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">addizionali_como_2025.md</code> /{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">scripts/gen-como-rates.mjs</code>.
        </p>
        <Link href="/" className="text-sm text-slate-600 underline hover:text-slate-900 dark:hover:text-slate-200">
          Torna alla dashboard
        </Link>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-50">Simulazione rapida (anagrafica)</h2>
        <p className="mb-4 text-xs text-slate-500">
          Anteprima senza salvare cedolino; usa i dati del tuo profilo.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-1 text-sm">
            Periodo (YYYY-MM)
            <input
              className="rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
              value={simPeriod}
              onChange={(e) => setSimPeriod(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={simPrevMonth}
              onChange={(e) => setSimPrevMonth(e.target.checked)}
            />
            Usa variabili del mese precedente
          </label>
          <Button type="button" disabled={simLoading} onClick={() => void onSimulate()}>
            {simLoading ? "Calcolo…" : "Simula il mio cedolino"}
          </Button>
        </div>
        {simLoading ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-slate-600 dark:text-slate-400">Calcolo in corso…</p>
            <progress className="h-2 w-full accent-slate-700 dark:accent-slate-300" />
          </div>
        ) : null}
        {simError ? <p className="mt-3 text-sm text-red-600">{simError}</p> : null}
        {simResult != null ? (
          <div className="mt-6 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-800/50">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Lordo imponibile (mese)
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                  {formatEuro(simResult.grossAdjusted)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-800/50">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Netto stimato (mese)
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {formatEuro(simResult.netSalary)}
                </p>
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-50">Righe di calcolo</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-600 dark:bg-slate-800">
                    <tr>
                      <th className="px-3 py-2 font-medium">Codice</th>
                      <th className="px-3 py-2 font-medium">Voce</th>
                      <th className="px-3 py-2 text-right font-medium">Importo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simResult.lines.map((line, idx) => (
                      <tr
                        key={`${idx}-${line.code}`}
                        className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                      >
                        <td className="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">
                          {line.code}
                        </td>
                        <td className="px-3 py-2 text-slate-800 dark:text-slate-200">{line.description}</td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums ${
                            line.amount < 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-50"
                          }`}
                        >
                          {formatEuro(line.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <button
              type="button"
              className="text-xs text-slate-500 underline hover:text-slate-700 dark:hover:text-slate-300"
              onClick={() => setSimShowJson((v) => !v)}
            >
              {simShowJson ? "Nascondi" : "Mostra"} dettaglio JSON
            </button>
            {simShowJson ? (
              <pre className="max-h-64 overflow-auto rounded bg-slate-50 p-3 text-xs dark:bg-slate-950">
                {JSON.stringify(simResult, null, 2)}
              </pre>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-50">Calcolo singolo dipendente</h2>
        <p className="mb-4 text-xs text-slate-600 dark:text-slate-400">
          Salva una <strong>bozza</strong> nel database (come il batch). Il dipendente vede il cedolino solo dopo{" "}
          <strong>Pubblica su Nexa</strong> per quel periodo.
        </p>
        {singleLoading ? (
          <p className="text-sm text-slate-500">Caricamento elenco dipendenti…</p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-slate-800 dark:text-slate-200">
                Dipendente
                <select
                  value={singleUserId}
                  onChange={(e) => {
                    setSingleUserId(e.target.value);
                    setSingleOkMsg(null);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {singleUsers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.fullName} ({item.role})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Periodo
                <input
                  type="month"
                  value={singlePeriod}
                  onChange={(e) => {
                    setSinglePeriod(e.target.value);
                    setSingleOkMsg(null);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                type="button"
                disabled={singleSubmitting || !singleUserId || !singlePeriod}
                onClick={() => void onSingleGenerate()}
              >
                {singleSubmitting ? "Calcolo in corso…" : "Calcola e salva bozza"}
              </Button>
              <Button type="button" variant="secondary" disabled={!singleResult} onClick={() => void onSinglePdf()}>
                Esporta PDF
              </Button>
            </div>
            {singleError ? <p className="mt-3 text-sm text-rose-600">{singleError}</p> : null}
            {singleOkMsg ? <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">{singleOkMsg}</p> : null}
            {singleResult ? (
              <div className="mt-6 space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {selectedSingleUser?.fullName} — {singleResult.period}
                  {singleResult.status === "draft" ? (
                    <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
                      Bozza
                    </span>
                  ) : null}
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs text-slate-500">Lordo</p>
                    <p className="text-lg font-semibold">
                      {payslipCurrency} {(singleResult.grossSalary ?? 0).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Netto</p>
                    <p className="text-lg font-semibold">
                      {payslipCurrency} {singleResult.netSalary.toFixed(2)}
                    </p>
                  </div>
                </div>
                <ul className="max-h-48 space-y-1 overflow-auto text-sm text-slate-700 dark:text-slate-300">
                  {(singleResult.lines ?? []).slice(0, 12).map((line, i) => (
                    <li key={`${i}-${line.code}`} className="flex justify-between gap-2">
                      <span>
                        {line.code} — {line.description}
                      </span>
                      <span className="tabular-nums">
                        {payslipCurrency} {line.amount.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Elaborazione batch (bozze)</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Genera cedolini in <strong>bozza</strong> per tutti i dipendenti IT; pubblica quando sei pronto. I dipendenti
          vedono i cedolini solo dopo la pubblicazione.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-1 text-sm">
            Periodo competenza (YYYY-MM)
            <input
              className="rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
              value={batchPeriod}
              onChange={(e) => setBatchPeriod(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={batchPrevMonth}
              onChange={(e) => setBatchPrevMonth(e.target.checked)}
            />
            Variabili da mese precedente
          </label>
          <Button type="button" disabled={loadingBatch} onClick={() => void onBatch()}>
            {loadingBatch ? "Elaborazione…" : "Elabora con Hebb (batch)"}
          </Button>
        </div>
        {batchError ? <p className="text-sm text-red-600">{batchError}</p> : null}
        {publishMsg ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{publishMsg}</p> : null}
        {loadingBatch ? (
          <div className="space-y-2 pt-2">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Elaborazione batch in corso sul server: attendere (può richiedere alcuni minuti per molti dipendenti).
            </p>
            <progress className="h-2 w-full accent-slate-700 dark:accent-slate-300" />
          </div>
        ) : null}

        {batchResults && batchResults.length > 0 ? (
          <div className="space-y-3 pt-2">
            {batchAllOk ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                Elaborazione completata con successo
              </p>
            ) : null}
            {batchHasErrors ? (
              <>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Completata con errori ({batchFailures.length} di {batchResults.length})
                </p>
                <ul className="space-y-2">
                  {batchFailures.map((r) => (
                    <li
                      key={r.userId}
                      className="flex flex-col gap-0.5 rounded-lg border border-red-200 px-3 py-2 text-sm dark:border-red-900/60 sm:flex-row sm:justify-between"
                    >
                      <span>{userNames[r.userId] ?? r.userId}</span>
                      <span className="text-red-600">{r.error ?? "Errore"}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Bozze da pubblicare</h2>
          <Button type="button" variant="secondary" size="sm" disabled={loadingDrafts} onClick={() => void loadDrafts()}>
            Aggiorna elenco
          </Button>
        </div>
        {loadingDrafts ? <p className="text-sm text-slate-500">Caricamento…</p> : null}
        {!loadingDrafts && drafts.length === 0 ? (
          <p className="text-sm text-slate-500">Nessuna bozza per questo periodo.</p>
        ) : (
          <ul className="max-h-72 space-y-2 overflow-auto text-sm">
            {drafts.map((d) => (
              <li
                key={d.id}
                className="flex flex-col gap-2 rounded-lg border border-slate-200 px-3 py-2 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700"
              >
                <div>
                  <span className="font-medium">{userNames[d.userId] ?? d.userId}</span>
                  <span className="ml-2 text-slate-500">{d.period}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => openDraftPreview(d)}>
                    Apri
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={pdfLoading}
                    onClick={() => void onDraftPdf(d)}
                  >
                    Scarica PDF
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Button type="button" disabled={publishing || drafts.length === 0} onClick={() => void onPublish()}>
          {publishing ? "Pubblicazione…" : "Pubblica su Nexa"}
        </Button>
      </section>

      <DraftPayslipPreviewDialog
        open={previewOpen}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewDraft(null);
        }}
        payslip={previewDraft}
        employeeName={previewDraft ? (userNames[previewDraft.userId] ?? previewDraft.userId) : ""}
        onDownloadPdf={() => {
          if (previewDraft) void onDraftPdf(previewDraft);
        }}
        pdfLoading={pdfLoading}
      />
    </div>
  );
}
