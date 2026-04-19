"use client";

import { CalendarRange, Clock, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HebbAiGlassPanel } from "@/components/hebb-ai-experience-shell";
import { Button } from "@/components/ui/button";
import {
  fetchShiftProposals,
  fetchCurrentUser,
  fetchUsers,
  type ShiftProposalDto,
  type User
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";

function formatShiftWindow(isoStart: string, isoEnd: string): string {
  const start = new Date(isoStart);
  const end = new Date(isoEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${isoStart} → ${isoEnd}`;
  }
  const dayFmt = new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  const timeFmt = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" });
  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    return `${dayFmt.format(start)} · ${timeFmt.format(start)} – ${timeFmt.format(end)}`;
  }
  return `${dayFmt.format(start)} ${timeFmt.format(start)} → ${dayFmt.format(end)} ${timeFmt.format(end)}`;
}

function weekRangeLabel(weekStartIso: string): string {
  const d = new Date(weekStartIso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return weekStartIso;
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const fmt = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" });
  return `${fmt.format(d)} – ${fmt.format(end)} ${d.getFullYear()}`;
}

export default function SchedulingPage(): React.JSX.Element {
  const [week, setWeek] = useState(() => new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<ShiftProposalDto[]>([]);
  const [usersById, setUsersById] = useState<Record<string, User>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      return;
    }
    setLoading(true);
    try {
      await fetchCurrentUser(token);
      const [res, users] = await Promise.all([fetchShiftProposals(token, week), fetchUsers(token).catch(() => [])]);
      setItems((res.items ?? []).filter((it) => Boolean(it.id && it.userId)));
      const map: Record<string, User> = {};
      for (const u of users) {
        map[u.id] = u;
      }
      setUsersById(map);
    } finally {
      setLoading(false);
    }
  }, [week]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => a.startAt.localeCompare(b.startAt));
  }, [items]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <HebbAiGlassPanel>
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
              <CalendarRange className="h-4 w-4 text-[var(--prom-gold)]" aria-hidden />
              Proposte turno
            </h2>
            <p className="mt-1 text-xs text-[var(--prom-muted)]">
              Settimana {weekRangeLabel(week)} · orari in fuso locale
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-[var(--prom-muted)]">
              <span className="sr-only">Inizio settimana</span>
              <input
                type="date"
                value={week}
                onChange={(e) => setWeek(e.target.value)}
                className="rounded-xl border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface)_90%,transparent)] px-3 py-2 text-sm text-[var(--prom-text)] shadow-sm"
              />
            </label>
            <Button type="button" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? "Aggiornamento…" : "Aggiorna"}
            </Button>
          </div>
        </div>
      </HebbAiGlassPanel>

      {loading && items.length === 0 ? (
        <p className="text-center text-sm text-[var(--prom-muted)]">Caricamento proposte…</p>
      ) : sorted.length === 0 ? (
        <HebbAiGlassPanel className="py-12 text-center">
          <p className="text-sm text-[var(--prom-muted)]">Nessuna proposta per questa settimana.</p>
        </HebbAiGlassPanel>
      ) : (
        <ul className="space-y-3">
          {sorted.map((it) => {
            const person = usersById[it.userId];
            const name = person?.fullName ?? person?.email ?? "Dipendente";
            const subtitle = person?.email && person.fullName ? person.email : null;
            return (
              <li key={it.id}>
                <HebbAiGlassPanel className="transition hover:border-[color-mix(in_srgb,var(--prom-gold)_40%,var(--prom-line))]">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#002D72] to-[#1a4d8c] text-white shadow-md">
                        <UserRound className="h-5 w-5 opacity-95" aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-[var(--prom-text)]">{name}</p>
                        {subtitle ? <p className="truncate text-xs text-[var(--prom-muted)]">{subtitle}</p> : null}
                        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--prom-muted)]">
                          <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--prom-gold)]" aria-hidden />
                          <span className="leading-relaxed text-[var(--prom-text)]">{formatShiftWindow(it.startAt, it.endAt)}</span>
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--prom-muted)]">
                      Bozza
                    </span>
                  </div>
                </HebbAiGlassPanel>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
