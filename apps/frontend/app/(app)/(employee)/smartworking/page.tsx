"use client";

import { CalendarDays, Check, Laptop, Loader2, Pencil, SendHorizonal, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cancelSmartworkingRequest,
  createSmartworkingRequest,
  fetchSmartworkingMe,
  updateSmartworkingRequest,
  type SmartworkingRequestDto
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { HebbAiGlassPanel, HebbAiGlassTile } from "@/components/hebb-ai-experience-shell";
import { Button } from "@/components/ui/button";

function formatDayIt(isoDay: string): string {
  const d = new Date(isoDay.slice(0, 10) + "T12:00:00");
  if (Number.isNaN(d.getTime())) return isoDay.slice(0, 10);
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(d);
}

function statusLabel(status: SmartworkingRequestDto["status"]): string {
  switch (status) {
    case "pending":
      return "In attesa";
    case "approved":
      return "Approvata";
    case "rejected":
      return "Respinta";
    default:
      return status;
  }
}

function statusStyles(status: SmartworkingRequestDto["status"]): string {
  switch (status) {
    case "pending":
      return "border-amber-400/50 bg-amber-500/10 text-amber-100";
    case "approved":
      return "border-emerald-400/40 bg-emerald-500/10 text-emerald-100";
    case "rejected":
      return "border-rose-400/40 bg-rose-500/10 text-rose-100";
    default:
      return "border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_80%,transparent)] text-[var(--prom-muted)]";
  }
}

export default function SmartworkingPage(): React.JSX.Element {
  const [balance, setBalance] = useState<{ used: number; quota: number } | null>(null);
  const [items, setItems] = useState<SmartworkingRequestDto[]>([]);
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { day: string; note: string }>>({});

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      return;
    }
    const data = await fetchSmartworkingMe(token);
    setBalance(data.balance);
    setItems(data.items);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const quotaPct = useMemo(() => {
    if (!balance || balance.quota <= 0) return 0;
    return Math.min(100, Math.round((balance.used / balance.quota) * 100));
  }, [balance]);

  async function onSavePending(r: SmartworkingRequestDto): Promise<void> {
    setErr(null);
    const token = getToken();
    if (!token) {
      return;
    }
    const dayEdit = edits[r.id]?.day ?? r.day;
    const noteEdit = edits[r.id]?.note ?? r.note ?? "";
    const dayNorm = dayEdit.slice(0, 10);
    const noteNorm = noteEdit.trim() || null;
    const prevNote = (r.note ?? "").trim() || null;
    if (dayNorm === r.day.slice(0, 10) && noteNorm === prevNote) {
      return;
    }
    setBusy(true);
    try {
      await updateSmartworkingRequest(token, r.id, { day: dayNorm, note: noteNorm ?? undefined });
      void load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Errore aggiornamento");
    } finally {
      setBusy(false);
    }
  }

  async function onCancel(r: SmartworkingRequestDto): Promise<void> {
    const token = getToken();
    if (!token) return;
    setErr(null);
    setCancelId(r.id);
    try {
      await cancelSmartworkingRequest(token, r.id);
      void load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Errore annullamento");
    } finally {
      setCancelId(null);
    }
  }

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setErr(null);
    const token = getToken();
    if (!token) {
      return;
    }
    const dayNorm = day.slice(0, 10);
    if (items.some((r) => r.day.slice(0, 10) === dayNorm && r.status !== "rejected")) {
      setErr("Remote working già richiesto per questa data");
      return;
    }
    setBusy(true);
    try {
      await createSmartworkingRequest(token, { day: dayNorm, note: note || undefined });
      setNote("");
      void load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-8">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-[var(--prom-gold)]">
          <Laptop className="h-5 w-5" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wider">Richieste</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--prom-text)]">Remote working</h1>
        <p className="text-sm text-[var(--prom-muted)]">
          Pianifica i giorni in remoto: salva le modifiche mentre la richiesta è in attesa, annulla se cambi idea.
        </p>
      </header>

      {balance ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <HebbAiGlassTile className="!p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">Saldo mese corrente</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--prom-text)]">
              {balance.used}
              <span className="text-lg font-normal text-[var(--prom-muted)]"> / {balance.quota}</span>
            </p>
            <p className="mt-1 text-xs text-[var(--prom-muted)]">giorni utilizzati sulla quota</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--prom-line)_80%,transparent)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#002D72] to-[var(--prom-gold)] transition-[width] duration-500"
                style={{ width: `${quotaPct}%` }}
              />
            </div>
          </HebbAiGlassTile>
          <HebbAiGlassTile className="!flex !flex-col !justify-center !p-4">
            <p className="text-sm text-[var(--prom-muted)]">
              Le richieste passano dal flusso di approvazione del team. Puoi modificare giorno e nota finché lo stato è
              «In attesa».
            </p>
          </HebbAiGlassTile>
        </div>
      ) : null}

      <HebbAiGlassPanel className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#002D72] to-[#1a4d8c] text-white shadow-md">
            <SendHorizonal className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[var(--prom-text)]">Nuova richiesta</h2>
            <p className="mt-0.5 text-xs text-[var(--prom-muted)]">Scegli il giorno e un messaggio opzionale per il responsabile.</p>
          </div>
        </div>

        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="group flex flex-col gap-1.5 text-xs font-medium text-[var(--prom-muted)]">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-[var(--prom-gold)]" aria-hidden />
                Giorno
              </span>
              <input
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className="rounded-xl border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface)_88%,transparent)] px-3 py-2.5 text-sm text-[var(--prom-text)] shadow-sm transition focus:border-[color-mix(in_srgb,var(--prom-gold)_50%,var(--prom-line))] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--prom-gold)_25%,transparent)]"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--prom-muted)]">
              Nota per il responsabile (facoltativa)
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Es. riunione con fornitore estero…"
                className="rounded-xl border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface)_88%,transparent)] px-3 py-2.5 text-sm text-[var(--prom-text)] shadow-sm placeholder:text-[var(--prom-muted)]/70 focus:border-[color-mix(in_srgb,var(--prom-gold)_50%,var(--prom-line))] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--prom-gold)_25%,transparent)]"
              />
            </label>
          </div>
          {err ? <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{err}</p> : null}
          <Button type="submit" disabled={busy} className="w-full gap-2 sm:w-auto">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Invia richiesta
          </Button>
        </form>
      </HebbAiGlassPanel>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Le tue richieste</h2>
        {items.length === 0 ? (
          <HebbAiGlassPanel className="py-10 text-center text-sm text-[var(--prom-muted)]">
            Nessuna richiesta ancora. Compila il modulo sopra per iniziare.
          </HebbAiGlassPanel>
        ) : (
          <ul className="space-y-3">
            {items.map((r) => (
              <li key={r.id}>
                <HebbAiGlassPanel className="space-y-3 !p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-[var(--prom-text)]">{formatDayIt(r.day)}</p>
                      <p className="text-xs text-[var(--prom-muted)]">{r.day.slice(0, 10)}</p>
                    </div>
                    <span
                      className={
                        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold " +
                        statusStyles(r.status)
                      }
                    >
                      {statusLabel(r.status)}
                    </span>
                  </div>

                  {r.status === "pending" ? (
                    <div className="space-y-3 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_70%,transparent)] p-3">
                      <div className="flex items-center gap-2 text-xs font-medium text-[var(--prom-gold)]">
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        Modifica prima dell&apos;approvazione
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <label className="block min-w-0 flex-1 text-xs text-[var(--prom-muted)]">
                          Giorno
                          <input
                            type="date"
                            value={edits[r.id]?.day ?? r.day}
                            onChange={(ev) =>
                              setEdits((prev) => ({
                                ...prev,
                                [r.id]: { day: ev.target.value, note: prev[r.id]?.note ?? r.note ?? "" }
                              }))
                            }
                            className="mt-1 w-full rounded-lg border border-[var(--prom-line-strong)] bg-transparent px-2 py-2 text-[var(--prom-text)]"
                          />
                        </label>
                        <label className="block min-w-0 flex-1 text-xs text-[var(--prom-muted)]">
                          Nota
                          <input
                            value={edits[r.id]?.note ?? r.note ?? ""}
                            onChange={(ev) =>
                              setEdits((prev) => ({
                                ...prev,
                                [r.id]: { day: prev[r.id]?.day ?? r.day, note: ev.target.value }
                              }))
                            }
                            className="mt-1 w-full rounded-lg border border-[var(--prom-line-strong)] bg-transparent px-2 py-2 text-[var(--prom-text)]"
                          />
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void onSavePending(r)}>
                          Salva modifiche
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1 border-rose-400/40 text-rose-100 hover:bg-rose-500/10"
                          disabled={busy || cancelId === r.id}
                          onClick={() => void onCancel(r)}
                        >
                          {cancelId === r.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5" />
                          )}
                          Annulla richiesta
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 rounded-lg border border-[var(--prom-line)]/60 bg-[color-mix(in_srgb,var(--prom-surface-soft)_60%,transparent)] px-3 py-2 text-sm text-[var(--prom-muted)]">
                      {(r.note ?? "").trim() ? (
                        <span className="text-[var(--prom-text)]">Nota: {(r.note ?? "").trim()}</span>
                      ) : (
                        <span className="italic">Nessuna nota</span>
                      )}
                      {r.status === "rejected" && (r.rejectReason ?? "").trim() ? (
                        <p className="text-xs text-rose-200/90">Motivo: {(r.rejectReason ?? "").trim()}</p>
                      ) : null}
                    </div>
                  )}
                </HebbAiGlassPanel>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
