"use client";

import {
  CalendarRange,
  CheckSquare,
  Clock,
  Grid3x3,
  ListOrdered,
  Megaphone,
  Settings2,
  Square,
  Trash2,
  UserRound,
  Users
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HebbAiGlassPanel } from "@/components/hebb-ai-experience-shell";
import { NexaPageHelpButton } from "@/components/nexa-page-help-button";
import { NexaSelect } from "@/components/nexa-select";
import { Button } from "@/components/ui/button";
import { EmployeeLink } from "@/components/nexa-entity-links";
import {
  createShiftPreset,
  deleteShift,
  deleteShiftPreset,
  fetchCurrentUser,
  fetchSchedulingWeek,
  fetchShiftPresets,
  fetchShiftProposals,
  fetchUsers,
  postCreateShift,
  postPublishShiftsWeek,
  postShiftsBulk,
  type ShiftDto,
  type ShiftPresetDto,
  type ShiftProposalDto,
  type User
} from "@/lib/api";
import { getToken, type SessionUser } from "@/lib/auth-session";

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
  const d = new Date(weekStartIso + "T12:00:00.000Z");
  if (Number.isNaN(d.getTime())) return weekStartIso;
  const end = new Date(d);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt.format(d)} – ${fmt.format(end)} ${d.getUTCFullYear()} (UTC)`;
}

function weekDayDatesUtc(weekStartIso: string): string[] {
  const out: string[] = [];
  const base = new Date(`${weekStartIso}T12:00:00.000Z`);
  if (Number.isNaN(base.getTime())) return [];
  for (let i = 0; i < 7; i += 1) {
    const x = new Date(base);
    x.setUTCDate(x.getUTCDate() + i);
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
}

function dayHeaderLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

type Panel = "grid" | "proposals" | "presets";

const FALLBACK_PRESETS = {
  morning: { label: "Mattina 08–17 UTC", start: "T08:00:00.000Z", end: "T17:00:00.000Z" },
  evening: { label: "Sera 14–22 UTC", start: "T14:00:00.000Z", end: "T22:00:00.000Z" }
} as const;

function presetTimeSuffix(t: string): string {
  const p = t.trim().split(":");
  const hh = (p[0] ?? "08").padStart(2, "0");
  const mm = (p[1] ?? "00").padStart(2, "0");
  const ss = (p[2] ?? "00").padStart(2, "0");
  return `T${hh}:${mm}:${ss}.000Z`;
}

function presetWindowForDay(ymd: string, preset: ShiftPresetDto): { start: string; end: string } {
  return { start: `${ymd}${presetTimeSuffix(preset.startTime)}`, end: `${ymd}${presetTimeSuffix(preset.endTime)}` };
}

type PresetFormState = {
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  isDefault: boolean;
  workTeamId: string;
  userId: string;
};

function PresetsPanel(props: {
  shiftPresets: ShiftPresetDto[];
  presetForm: PresetFormState;
  setPresetForm: React.Dispatch<React.SetStateAction<PresetFormState>>;
  busy: boolean;
  onCreate: () => void;
  onDelete: (id: string) => void;
}): React.JSX.Element {
  const { shiftPresets, presetForm, setPresetForm, busy, onCreate, onDelete } = props;
  return (
    <HebbAiGlassPanel className="space-y-4">
      <h3 className="text-sm font-semibold text-[var(--prom-text)]">Preset turno salvati</h3>
      <p className="text-xs text-[var(--prom-muted)]">
        Crea preset con orario UTC e imposta default azienda (o assegna team/dipendente dal form API).
      </p>
      <ul className="space-y-2">
        {shiftPresets.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--prom-line)] px-3 py-2 text-sm"
          >
            <div>
              <p className="font-medium text-[var(--prom-text)]">{p.name}</p>
              <p className="text-xs text-[var(--prom-muted)]">
                {p.startTime.slice(0, 5)}–{p.endTime.slice(0, 5)} UTC{p.isDefault ? " · default" : ""}
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onDelete(p.id)}>
              Elimina
            </Button>
          </li>
        ))}
        {shiftPresets.length === 0 ? <li className="text-sm text-[var(--prom-muted)]">Nessun preset.</li> : null}
      </ul>
      <div className="grid gap-3 border-t border-[var(--prom-line)] pt-4 sm:grid-cols-2">
        <label className="text-xs text-[var(--prom-muted)]">
          Nome
          <input
            className="mt-1 w-full rounded-lg border border-[var(--prom-line)] px-2 py-1.5 text-sm text-[var(--prom-text)]"
            value={presetForm.name}
            onChange={(e) => setPresetForm((f) => ({ ...f, name: e.target.value }))}
          />
        </label>
        <label className="text-xs text-[var(--prom-muted)]">
          Inizio UTC
          <input
            type="time"
            className="mt-1 w-full rounded-lg border border-[var(--prom-line)] px-2 py-1.5 text-sm"
            value={presetForm.startTime}
            onChange={(e) => setPresetForm((f) => ({ ...f, startTime: e.target.value }))}
          />
        </label>
        <label className="text-xs text-[var(--prom-muted)]">
          Fine UTC
          <input
            type="time"
            className="mt-1 w-full rounded-lg border border-[var(--prom-line)] px-2 py-1.5 text-sm"
            value={presetForm.endTime}
            onChange={(e) => setPresetForm((f) => ({ ...f, endTime: e.target.value }))}
          />
        </label>
        <label className="flex items-center gap-2 text-xs sm:col-span-2">
          <input
            type="checkbox"
            checked={presetForm.isDefault}
            onChange={(e) => setPresetForm((f) => ({ ...f, isDefault: e.target.checked }))}
          />
          Default azienda
        </label>
      </div>
      <Button type="button" size="sm" disabled={busy} onClick={onCreate}>
        Salva preset
      </Button>
    </HebbAiGlassPanel>
  );
}

export default function SchedulingPage(): React.JSX.Element {
  const [panel, setPanel] = useState<Panel>("grid");
  const [week, setWeek] = useState(() => new Date().toISOString().slice(0, 10));
  const [proposalItems, setProposalItems] = useState<ShiftProposalDto[]>([]);
  const [respectAbsences, setRespectAbsences] = useState(true);
  const [weekShifts, setWeekShifts] = useState<ShiftDto[]>([]);
  const [usersById, setUsersById] = useState<Record<string, User>>({});
  const [viewer, setViewer] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [dayMask, setDayMask] = useState<boolean[]>(() => [true, true, true, true, true, false, false]);
  const [presetKey, setPresetKey] = useState<keyof typeof FALLBACK_PRESETS>("morning");
  const [shiftPresets, setShiftPresets] = useState<ShiftPresetDto[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [workTeams, setWorkTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [presetForm, setPresetForm] = useState({
    name: "",
    startTime: "08:00",
    endTime: "17:00",
    breakMinutes: 0,
    isDefault: false,
    workTeamId: "",
    userId: ""
  });

  const activePresetWindow = useMemo(() => {
    const dbPreset = shiftPresets.find((p) => p.id === selectedPresetId);
    if (dbPreset) {
      return (ymd: string) => presetWindowForDay(ymd, dbPreset);
    }
    const fb = FALLBACK_PRESETS[presetKey];
    return (ymd: string) => ({ start: `${ymd}${fb.start}`, end: `${ymd}${fb.end}` });
  }, [shiftPresets, selectedPresetId, presetKey]);

  const dayDates = useMemo(() => weekDayDatesUtc(week), [week]);

  const loadProposals = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const me = await fetchCurrentUser(token);
      setViewer(me);
      const [res, users] = await Promise.all([
        fetchShiftProposals(token, week, { respectAbsences }),
        fetchUsers(token).catch(() => [] as User[])
      ]);
      setProposalItems((res.items ?? []).filter((it) => Boolean(it.id && it.userId)));
      const map: Record<string, User> = {};
      for (const u of users) map[u.id] = u;
      setUsersById(map);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore caricamento proposte");
    } finally {
      setLoading(false);
    }
  }, [week, respectAbsences]);

  const loadGrid = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const me = await fetchCurrentUser(token);
      setViewer(me);
      const [w, users, presetsRes] = await Promise.all([
        fetchSchedulingWeek(token, week),
        fetchUsers(token).catch(() => [] as User[]),
        fetchShiftPresets(token).catch(() => ({ items: [] as ShiftPresetDto[] }))
      ]);
      setWeekShifts((w.items ?? []).filter((it) => Boolean(it.id && it.userId)));
      const presets = presetsRes.items ?? [];
      setShiftPresets(presets);
      if (!selectedPresetId && presets[0]) setSelectedPresetId(presets[0].id);
      const map: Record<string, User> = {};
      for (const u of users) map[u.id] = u;
      setUsersById(map);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore caricamento griglia");
    } finally {
      setLoading(false);
    }
  }, [week]);

  const loadPresets = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const [me, presetsRes, users] = await Promise.all([
        fetchCurrentUser(token),
        fetchShiftPresets(token),
        fetchUsers(token).catch(() => [] as User[])
      ]);
      setViewer(me);
      const items = presetsRes.items ?? [];
      setShiftPresets(items);
      if (!selectedPresetId && items[0]) setSelectedPresetId(items[0].id);
      const map: Record<string, User> = {};
      for (const u of users) map[u.id] = u;
      setUsersById(map);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore caricamento preset");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (panel === "proposals") void loadProposals();
    else if (panel === "presets") void loadPresets();
    else void loadGrid();
  }, [panel, loadProposals, loadGrid, loadPresets]);

  const sortedProposals = useMemo(() => [...proposalItems].sort((a, b) => a.startAt.localeCompare(b.startAt)), [proposalItems]);

  const gridUsers = useMemo(() => {
    const list = Object.values(usersById);
    list.sort((a, b) => (a.fullName ?? a.email).localeCompare(b.fullName ?? b.email));
    return list;
  }, [usersById]);

  const shiftsByUserDay = useMemo(() => {
    const m = new Map<string, ShiftDto[]>();
    for (const s of weekShifts) {
      const day = s.startAt.slice(0, 10);
      const k = `${s.userId}|${day}`;
      const arr = m.get(k) ?? [];
      arr.push(s);
      m.set(k, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return m;
  }, [weekShifts]);

  const toggleUser = (userId: string): void => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(userId)) n.delete(userId);
      else n.add(userId);
      return n;
    });
  };

  const toggleDay = (idx: number): void => {
    setDayMask((prev) => {
      const n = [...prev];
      n[idx] = !n[idx];
      return n;
    });
  };

  const onBulkPreset = async (): Promise<void> => {
    const token = getToken();
    if (!token) return;
    if (selected.size === 0) {
      setErr("Seleziona almeno un dipendente.");
      return;
    }
    const items: Array<{ userId: string; startAt: string; endAt: string }> = [];
    for (const uid of selected) {
      for (let i = 0; i < 7; i += 1) {
        if (!dayMask[i]) continue;
        const ymd = dayDates[i];
        if (!ymd) continue;
        const w = activePresetWindow(ymd);
        items.push({ userId: uid, startAt: w.start, endAt: w.end });
      }
    }
    if (items.length === 0) {
      setErr("Attiva almeno un giorno della settimana.");
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await postShiftsBulk(token, { items });
      setMsg(`Creati ${items.length} turni in bozza.`);
      await loadGrid();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore creazione massiva");
    } finally {
      setBusy(false);
    }
  };

  const onPublish = async (): Promise<void> => {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await postPublishShiftsWeek(token, week);
      setMsg(`Pubblicati ${r.published} turni · notifiche inviate a ${r.notified} dipendenti.`);
      await loadGrid();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore pubblicazione");
    } finally {
      setBusy(false);
    }
  };

  const onDeleteShift = async (id: string): Promise<void> => {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteShift(token, id);
      await loadGrid();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Eliminazione non riuscita");
    } finally {
      setBusy(false);
    }
  };

  const onCreatePreset = async (): Promise<void> => {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const { item } = await createShiftPreset(token, {
        name: presetForm.name,
        startTime: presetForm.startTime,
        endTime: presetForm.endTime,
        breakMinutes: presetForm.breakMinutes,
        isDefault: presetForm.isDefault,
        workTeamId: presetForm.workTeamId || undefined,
        userId: presetForm.userId || undefined
      });
      setSelectedPresetId(item.id);
      setPresetForm({
        name: "",
        startTime: "08:00",
        endTime: "17:00",
        breakMinutes: 0,
        isDefault: false,
        workTeamId: "",
        userId: ""
      });
      setMsg(`Preset «${item.name}» creato.`);
      await loadPresets();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Creazione preset non riuscita");
    } finally {
      setBusy(false);
    }
  };

  const onDeletePreset = async (presetId: string): Promise<void> => {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteShiftPreset(token, presetId);
      if (selectedPresetId === presetId) setSelectedPresetId("");
      await loadPresets();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Eliminazione preset non riuscita");
    } finally {
      setBusy(false);
    }
  };

  const onQuickAdd = async (userId: string, ymd: string): Promise<void> => {
    const token = getToken();
    if (!token) return;
    const w = activePresetWindow(ymd);
    setBusy(true);
    setErr(null);
    try {
      await postCreateShift(token, { userId, startAt: w.start, endAt: w.end });
      await loadGrid();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Creazione turno non riuscita");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[110rem] space-y-6 px-2 pb-10 sm:px-4">
      <HebbAiGlassPanel>
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
              <CalendarRange className="h-4 w-4 text-[var(--prom-gold)]" aria-hidden />
              Pianificazione turni
            </h2>
            <p className="mt-1 text-xs text-[var(--prom-muted)]">
              Settimana {weekRangeLabel(week)} · orari espressi in <strong className="text-[var(--prom-text)]">UTC</strong>{" "}
              (allineati al backend)
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
            <div className="flex rounded-xl border border-[var(--prom-line)] p-0.5">
              <button
                type="button"
                className={[
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
                  panel === "grid" ? "bg-[#002D72] text-white shadow" : "text-[var(--prom-muted)]"
                ].join(" ")}
                onClick={() => setPanel("grid")}
              >
                <Grid3x3 className="h-3.5 w-3.5" aria-hidden />
                Griglia
              </button>
              <button
                type="button"
                className={[
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
                  panel === "proposals" ? "bg-[#002D72] text-white shadow" : "text-[var(--prom-muted)]"
                ].join(" ")}
                onClick={() => setPanel("proposals")}
              >
                <ListOrdered className="h-3.5 w-3.5" aria-hidden />
                Proposte
              </button>
              <button
                type="button"
                className={[
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
                  panel === "presets" ? "bg-[#002D72] text-white shadow" : "text-[var(--prom-muted)]"
                ].join(" ")}
                onClick={() => setPanel("presets")}
              >
                <Settings2 className="h-3.5 w-3.5" aria-hidden />
                Preset
              </button>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() =>
                void (panel === "grid" ? loadGrid() : panel === "presets" ? loadPresets() : loadProposals())
              }
              disabled={loading}
            >
              {loading ? "Aggiornamento…" : "Aggiorna"}
            </Button>
            <NexaPageHelpButton pageKey="scheduling" />
          </div>
        </div>
      </HebbAiGlassPanel>

      {err ? (
        <HebbAiGlassPanel className="border-red-400/40 bg-red-500/10 text-sm text-red-800 dark:text-red-100">{err}</HebbAiGlassPanel>
      ) : null}
      {msg ? (
        <HebbAiGlassPanel className="border-emerald-400/35 bg-emerald-500/10 text-sm text-emerald-950 dark:text-emerald-100">
          {msg}
        </HebbAiGlassPanel>
      ) : null}

      {panel === "proposals" ? (
        <>
          <HebbAiGlassPanel className="flex flex-wrap items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--prom-muted)]">
              <input
                type="checkbox"
                className="rounded border-[var(--prom-line-strong)]"
                checked={respectAbsences}
                onChange={(e) => setRespectAbsences(e.target.checked)}
              />
              Auto-proposta rispetta ferie / assenze / SW / trasferta (anteprima)
            </label>
          </HebbAiGlassPanel>
          {loading && proposalItems.length === 0 ? (
            <p className="text-center text-sm text-[var(--prom-muted)]">Caricamento proposte…</p>
          ) : sortedProposals.length === 0 ? (
            <HebbAiGlassPanel className="py-12 text-center">
              <p className="text-sm text-[var(--prom-muted)]">Nessuna proposta per questa settimana.</p>
            </HebbAiGlassPanel>
          ) : (
            <ul className="space-y-3">
              {sortedProposals.map((it) => {
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
                            <p className="truncate text-base font-semibold text-[var(--prom-text)]">
                              <EmployeeLink
                                userId={it.userId}
                                label={name}
                                managerId={person?.managerId}
                                viewer={viewer}
                                className="text-[var(--prom-text)] hover:text-[var(--prom-gold)] hover:underline"
                              />
                            </p>
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
        </>
      ) : panel === "presets" ? (
        <PresetsPanel
          shiftPresets={shiftPresets}
          presetForm={presetForm}
          setPresetForm={setPresetForm}
          busy={busy}
          onCreate={() => void onCreatePreset()}
          onDelete={(id) => void onDeletePreset(id)}
        />
      ) : (
        <>
          <HebbAiGlassPanel className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[var(--prom-text)]">Azioni di massa</h3>
                <p className="mt-1 max-w-2xl text-xs text-[var(--prom-muted)]">
                  Seleziona i dipendenti, i giorni (lun–dom UTC) e un preset orario. I turni rispettano ferie, malattia,
                  smart working, trasferte e l’intervallo minimo di 11 ore tra fine e inizio turno.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void onPublish()}>
                  <Megaphone className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Pubblica settimana
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-[var(--prom-muted)]">
                Preset orario
                <NexaSelect
                  className="mt-1 min-w-[14rem]"
                  value={selectedPresetId ? `db:${selectedPresetId}` : presetKey}
                  onChange={(v) => {
                    if (v.startsWith("db:")) {
                      setSelectedPresetId(v.slice(3));
                    } else {
                      setSelectedPresetId("");
                      setPresetKey(v as keyof typeof FALLBACK_PRESETS);
                    }
                  }}
                  options={[
                    ...shiftPresets.map((p) => ({
                      value: `db:${p.id}`,
                      label: `${p.name}${p.isDefault ? " · default" : ""}${p.userId ? " · dip." : p.workTeamId ? " · team" : ""}`
                    })),
                    { value: "morning", label: FALLBACK_PRESETS.morning.label },
                    { value: "evening", label: FALLBACK_PRESETS.evening.label }
                  ]}
                />
              </label>
              <div className="flex flex-wrap gap-1">
                {dayMask.map((on, i) => (
                  <button
                    key={dayDates[i] ?? i}
                    type="button"
                    title={dayDates[i]}
                    onClick={() => toggleDay(i)}
                    className={[
                      "min-w-[2.75rem] rounded-lg border px-2 py-1.5 text-[10px] font-semibold uppercase",
                      on
                        ? "border-[color-mix(in_srgb,var(--prom-gold)_50%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-gold)_22%,transparent)] text-[var(--prom-text)]"
                        : "border-[var(--prom-line)] text-[var(--prom-muted)]"
                    ].join(" ")}
                  >
                    {dayDates[i] ? dayHeaderLabel(dayDates[i]).slice(0, 3) : i}
                  </button>
                ))}
              </div>
              <Button type="button" size="sm" disabled={busy} onClick={() => void onBulkPreset()}>
                Applica preset ai selezionati
              </Button>
            </div>
          </HebbAiGlassPanel>

          <div className="overflow-x-auto rounded-2xl border border-[var(--prom-line)] shadow-[var(--glass-shadow)]">
            <table className="w-full min-w-[56rem] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_95%,transparent)]">
                  <th className="sticky left-0 z-20 min-w-[10rem] border-r border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_98%,transparent)] px-2 py-2 font-semibold text-[var(--prom-text)]">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-[var(--prom-gold)]" aria-hidden />
                      Dipendente
                    </span>
                  </th>
                  {dayDates.map((ymd) => (
                    <th key={ymd} className="min-w-[7rem] px-1 py-2 text-center font-semibold text-[var(--prom-muted)]">
                      <div className="text-[10px] uppercase text-[var(--prom-gold)]">{dayHeaderLabel(ymd)}</div>
                      <div className="font-mono text-[10px] text-[var(--prom-text)]">{ymd}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gridUsers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-[var(--prom-muted)]">
                      Nessun dipendente visibile per la pianificazione. Verifica i permessi o l’anagrafica.
                    </td>
                  </tr>
                ) : (
                  gridUsers.map((u) => {
                    const checked = selected.has(u.id);
                    return (
                      <tr key={u.id} className="border-b border-[var(--prom-line)] last:border-0">
                        <td className="sticky left-0 z-10 border-r border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_96%,transparent)] px-2 py-2 align-top">
                          <div className="flex items-start gap-2">
                            <button
                              type="button"
                              aria-label={checked ? "Deseleziona" : "Seleziona"}
                              className="mt-0.5 text-[var(--prom-muted)] hover:text-[var(--prom-gold)]"
                              onClick={() => toggleUser(u.id)}
                            >
                              {checked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                            </button>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-[var(--prom-text)]">
                                <EmployeeLink
                                  userId={u.id}
                                  label={u.fullName ?? u.email}
                                  managerId={u.managerId}
                                  viewer={viewer}
                                  className="hover:text-[var(--prom-gold)] hover:underline"
                                />
                              </p>
                              <p className="truncate text-[10px] text-[var(--prom-muted)]">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        {dayDates.map((ymd) => {
                          const key = `${u.id}|${ymd}`;
                          const list = shiftsByUserDay.get(key) ?? [];
                          return (
                            <td key={ymd} className="align-top px-1 py-1.5">
                              <div className="flex min-h-[3.5rem] flex-col gap-1">
                                {list.map((sh) => (
                                  <div
                                    key={sh.id}
                                    className="group relative rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] px-1.5 py-1"
                                  >
                                    <p className="font-mono text-[10px] leading-tight text-[var(--prom-text)]">
                                      {sh.startAt.slice(11, 16)}–{sh.endAt.slice(11, 16)}
                                    </p>
                                    <p className="text-[9px] uppercase text-[var(--prom-muted)]">
                                      {(sh.status ?? "scheduled") === "confirmed" ? "Confermato" : "Bozza"}
                                    </p>
                                    <button
                                      type="button"
                                      className="absolute right-0.5 top-0.5 rounded p-0.5 text-[var(--prom-muted)] opacity-0 hover:bg-red-500/15 hover:text-red-600 group-hover:opacity-100"
                                      title="Elimina turno"
                                      disabled={busy}
                                      onClick={() => void onDeleteShift(sh.id)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  disabled={busy}
                                  className="rounded border border-dashed border-[var(--prom-line)] px-1 py-0.5 text-[9px] text-[var(--prom-muted)] hover:border-[var(--prom-gold)] hover:text-[var(--prom-text)]"
                                  onClick={() => void onQuickAdd(u.id, ymd)}
                                >
                                  + preset
                                </button>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <HebbAiGlassPanel className="text-xs text-[var(--prom-muted)]">
            <p>
              <strong className="text-[var(--prom-text)]">Pubblica settimana</strong> imposta i turni della settimana come{" "}
              <em>confermati</em> e invia una notifica in-app ai dipendenti coinvolti. Usa le checkbox sulla griglia per
              selezionare i destinatari dell’applicazione massiva del preset.
            </p>
          </HebbAiGlassPanel>
        </>
      )}
    </div>
  );
}
