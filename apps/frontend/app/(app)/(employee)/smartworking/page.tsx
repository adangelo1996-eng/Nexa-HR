"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createSmartworkingRequest,
  fetchSmartworkingMe,
  updateSmartworkingRequest,
  type SmartworkingRequestDto
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";

export default function SmartworkingPage(): React.JSX.Element {
  const [balance, setBalance] = useState<{ used: number; quota: number } | null>(null);
  const [items, setItems] = useState<SmartworkingRequestDto[]>([]);
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
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

  async function onSavePending(r: SmartworkingRequestDto): Promise<void> {
    setErr(null);
    const token = getToken();
    if (!token) {
      return;
    }
    const day = edits[r.id]?.day ?? r.day;
    const note = edits[r.id]?.note ?? r.note ?? "";
    const dayNorm = day.slice(0, 10);
    const noteNorm = note.trim() || null;
    const prevNote = (r.note ?? "").trim() || null;
    if (dayNorm === r.day.slice(0, 10) && noteNorm === prevNote) {
      return;
    }
    try {
      await updateSmartworkingRequest(token, r.id, { day: dayNorm, note: noteNorm ?? undefined });
      void load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Errore aggiornamento");
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
      setErr("Smart working già richiesto per questa data");
      return;
    }
    try {
      await createSmartworkingRequest(token, { day: dayNorm, note: note || undefined });
      setNote("");
      void load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Errore");
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-[var(--prom-text)]">Smartworking</h1>
        {balance ? (
          <p className="text-sm text-[var(--prom-muted)]">
            Saldo mese: {balance.used}/{balance.quota} giorni
          </p>
        ) : null}
      </header>

      <form onSubmit={(e) => void onSubmit(e)} className="card max-w-md space-y-3">
        <label className="block text-sm text-[var(--prom-muted)]">
          Giorno
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-transparent px-3 py-2 text-[var(--prom-text)]"
          />
        </label>
        <label className="block text-sm text-[var(--prom-muted)]">
          Nota
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-transparent px-3 py-2 text-[var(--prom-text)]"
          />
        </label>
        {err ? <p className="text-sm text-rose-600">{err}</p> : null}
        <Button type="submit">Richiedi</Button>
      </form>

      <section>
        <h2 className="text-sm font-medium text-[var(--prom-text)]">Storico</h2>
        <ul className="mt-2 space-y-3 text-sm">
          {items.map((r) => (
            <li key={r.id} className="rounded border border-[var(--prom-line)] px-3 py-2">
              {r.status === "pending" ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="block flex-1 text-xs text-[var(--prom-muted)]">
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
                      className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-transparent px-2 py-1.5 text-[var(--prom-text)]"
                    />
                  </label>
                  <label className="block flex-1 text-xs text-[var(--prom-muted)]">
                    Nota
                    <input
                      value={edits[r.id]?.note ?? r.note ?? ""}
                      onChange={(ev) =>
                        setEdits((prev) => ({
                          ...prev,
                          [r.id]: { day: prev[r.id]?.day ?? r.day, note: ev.target.value }
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-transparent px-2 py-1.5 text-[var(--prom-text)]"
                    />
                  </label>
                  <Button type="button" size="sm" className="shrink-0" onClick={() => void onSavePending(r)}>
                    Salva
                  </Button>
                </div>
              ) : (
                <div className="flex justify-between gap-2">
                  <span className="text-[var(--prom-text)]">{r.day}</span>
                  <span className="text-[var(--prom-muted)]">{r.status}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
