"use client";

import { ArrowLeft, Calendar, Check, Loader2, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cancelMeetingRoomBooking,
  createMeetingRoomBooking,
  fetchMeetingRoomBookingEvents,
  fetchMeetingRoomColleagues,
  fetchMeetingRooms,
  type CalendarEventDto,
  type MeetingRoomColleagueDto,
  type MeetingRoomDto
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { HebbFieldAssistProvider, HebbInput } from "@/components/hebb-field-assist";
import { HebbAiGlassPanel, HebbAiGlassTile } from "@/components/hebb-ai-experience-shell";
import { NexaHrAppPage } from "@/components/nexa-hr-app-page";
import { Button } from "@/components/ui/button";

type Step = "room" | "schedule" | "confirm";

const DAY_START_H = 8;
const DAY_END_H = 19;
const MIN_DURATION_MIN = 15;
const MAX_DURATION_H = 12;

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

function amenityChips(room: MeetingRoomDto): string[] {
  const chips: string[] = [];
  if (room.hasProjector) chips.push("Proiettore");
  if (room.hasVideoConference) chips.push("Videoconferenza");
  if (room.hasScreen) chips.push("Schermo");
  if (room.hasWhiteboard) chips.push("Lavagna");
  for (const x of room.extraFeatures ?? []) {
    if (x.trim()) chips.push(x.trim());
  }
  return chips;
}

function timeRangeLabel(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

function combineDayAndTime(dayIso: string, timeHm: string): Date {
  const base = dayIso.slice(0, 10);
  const [h, m] = timeHm.split(":").map((x) => Number(x));
  return new Date(`${base}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function validateSchedule(input: {
  day: string;
  startTime: string;
  endTime: string;
  roomBookings: CalendarEventDto[];
}): string | null {
  const { day, startTime, endTime, roomBookings } = input;
  if (!day || !startTime || !endTime) {
    return "Indica data, ora di inizio e ora di fine.";
  }

  const start = combineDayAndTime(day, startTime);
  const end = combineDayAndTime(day, endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Orario non valido.";
  }
  if (end.getTime() <= start.getTime()) {
    return "L'ora di fine deve essere successiva all'ora di inizio.";
  }

  const durationMin = (end.getTime() - start.getTime()) / 60_000;
  if (durationMin < MIN_DURATION_MIN) {
    return `Durata minima: ${MIN_DURATION_MIN} minuti.`;
  }
  if (durationMin > MAX_DURATION_H * 60) {
    return `Durata massima: ${MAX_DURATION_H} ore.`;
  }

  const [startH] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  if (startH < DAY_START_H || endH > DAY_END_H || (endH === DAY_END_H && endM > 0)) {
    return `Orario consentito ${String(DAY_START_H).padStart(2, "0")}:00 – ${String(DAY_END_H).padStart(2, "0")}:00.`;
  }

  const startsAt = start.toISOString();
  const endsAt = end.toISOString();
  const conflict = roomBookings.some((ev) => overlaps(startsAt, endsAt, String(ev.start), String(ev.end)));
  if (conflict) {
    return "La sala è già prenotata in parte di questo intervallo.";
  }

  if (start.getTime() < Date.now()) {
    return "Non puoi prenotare un intervallo già trascorso.";
  }

  return null;
}

function StepIndicator({ step }: { step: Step }): React.JSX.Element {
  const order: Step[] = ["room", "schedule", "confirm"];
  const idx = order.indexOf(step) + 1;
  return (
    <p className="mb-4 text-xs uppercase tracking-wide text-[var(--prom-muted)]" aria-live="polite">
      Passo {idx} di 3
    </p>
  );
}

export default function SaleRiunioniPage(): React.JSX.Element {
  const [step, setStep] = useState<Step>("room");
  const [rooms, setRooms] = useState<MeetingRoomDto[]>([]);
  const [bookings, setBookings] = useState<CalendarEventDto[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<MeetingRoomDto | null>(null);
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [title, setTitle] = useState("");
  const [colleagues, setColleagues] = useState<MeetingRoomColleagueDto[]>([]);
  const [inviteeUserIds, setInviteeUserIds] = useState<string[]>([]);
  const [inviteeEmailsRaw, setInviteeEmailsRaw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const loadRooms = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) return;
    const items = await fetchMeetingRooms(token);
    setRooms(items);
  }, []);

  const loadBookings = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) return;
    const events = await fetchMeetingRoomBookingEvents(token, day, day);
    setBookings(events);
  }, [day]);

  const loadColleagues = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) return;
    const items = await fetchMeetingRoomColleagues(token);
    setColleagues(items);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        await Promise.all([loadRooms(), loadBookings(), loadColleagues()]);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Caricamento non riuscito");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadRooms, loadBookings, loadColleagues]);

  useEffect(() => {
    if (step === "schedule" || step === "confirm") {
      void loadBookings().catch(() => setBookings([]));
    }
  }, [step, loadBookings]);

  const roomBookings = useMemo(() => {
    if (!selectedRoom) return [];
    return bookings.filter((ev) => String(ev.meta?.roomId ?? "") === selectedRoom.id);
  }, [bookings, selectedRoom]);

  const scheduledRange = useMemo(() => {
    const start = combineDayAndTime(day, startTime);
    const end = combineDayAndTime(day, endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return null;
    }
    return {
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      label: timeRangeLabel(start, end),
      durationMinutes: Math.round((end.getTime() - start.getTime()) / 60_000)
    };
  }, [day, startTime, endTime]);

  const scheduleError = useMemo(
    () =>
      step === "schedule" || step === "confirm"
        ? validateSchedule({ day, startTime, endTime, roomBookings })
        : null,
    [step, day, startTime, endTime, roomBookings]
  );

  const myUpcoming = useMemo(() => {
    const now = Date.now();
    return bookings
      .filter((ev) => new Date(String(ev.end)).getTime() >= now)
      .sort((a, b) => String(a.start).localeCompare(String(b.start)))
      .slice(0, 8);
  }, [bookings]);

  const goBack = (): void => {
    if (step === "schedule") setStep("room");
    else if (step === "confirm") setStep("schedule");
  };

  const confirmBooking = async (): Promise<void> => {
    if (!selectedRoom || !scheduledRange) return;
    const validationErr = validateSchedule({ day, startTime, endTime, roomBookings });
    if (validationErr) {
      setErr(validationErr);
      return;
    }
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setErr(null);
    try {
      await createMeetingRoomBooking(token, selectedRoom.id, {
        startsAt: scheduledRange.startsAt,
        endsAt: scheduledRange.endsAt,
        title: title.trim() || `Riunione — ${selectedRoom.name}`,
        inviteeUserIds,
        inviteeEmails: inviteeEmailsRaw
          .split(/[,;\s]+/)
          .map((x) => x.trim())
          .filter(Boolean)
      });
      setTitle("");
      setInviteeUserIds([]);
      setInviteeEmailsRaw("");
      setStartTime("09:00");
      setEndTime("10:00");
      setSelectedRoom(null);
      setStep("room");
      await loadBookings();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Prenotazione non riuscita");
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async (bookingId: string): Promise<void> => {
    const token = getToken();
    if (!token) return;
    setCancelId(bookingId);
    setErr(null);
    try {
      await cancelMeetingRoomBooking(token, bookingId);
      await loadBookings();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Annullamento non riuscito");
    } finally {
      setCancelId(null);
    }
  };

  return (
    <NexaHrAppPage
      eyebrow="Prenotazioni"
      title="Sale riunioni"
      subtitle="Scegli sala, data e intervallo orario (inizio–fine). Le prenotazioni sono visibili in azienda."
    >
      <StepIndicator step={step} />

      {err ? (
        <p className="mb-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {err}
        </p>
      ) : null}

      {step !== "room" ? (
        <Button type="button" variant="ghost" className="mb-4 gap-2" onClick={goBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Indietro
        </Button>
      ) : null}

      {step === "room" ? (
        <section>
          {loading ? (
            <p className="flex items-center gap-2 text-[var(--prom-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Caricamento sale…
            </p>
          ) : rooms.length === 0 ? (
            <HebbAiGlassPanel>
              <p className="text-sm text-[var(--prom-muted)]">
                Nessuna sala configurata per la tua azienda. Contatta l&apos;amministratore HR.
              </p>
            </HebbAiGlassPanel>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {rooms.map((room) => (
                <li key={room.id}>
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => {
                      setSelectedRoom(room);
                      setStep("schedule");
                    }}
                  >
                    <HebbAiGlassTile className="h-full transition hover:border-[var(--prom-accent)]/50">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h2 className="text-lg font-semibold text-[var(--prom-fg)]">{room.name}</h2>
                          {room.location ? (
                            <p className="mt-1 text-sm text-[var(--prom-muted)]">{room.location}</p>
                          ) : null}
                        </div>
                        {room.seats != null ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--prom-line)] px-2 py-0.5 text-xs text-[var(--prom-muted)]">
                            <Users className="h-3 w-3" aria-hidden />
                            {room.seats} posti
                          </span>
                        ) : null}
                      </div>
                      <ul className="mt-3 flex flex-wrap gap-1.5">
                        {amenityChips(room).map((c) => (
                          <li
                            key={c}
                            className="rounded-md border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_70%,transparent)] px-2 py-0.5 text-xs text-[var(--prom-muted)]"
                          >
                            {c}
                          </li>
                        ))}
                      </ul>
                    </HebbAiGlassTile>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {myUpcoming.length > 0 ? (
            <HebbAiGlassPanel className="mt-8">
              <h3 className="mb-3 text-sm font-medium text-[var(--prom-fg)]">Prenotazioni in giornata</h3>
              <ul className="space-y-2">
                {myUpcoming.map((ev) => {
                  const bookingId = String(ev.meta?.bookingId ?? "");
                  const room = rooms.find((r) => r.id === String(ev.meta?.roomId ?? ""));
                  const start = new Date(String(ev.start));
                  const end = new Date(String(ev.end));
                  return (
                    <li
                      key={ev.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--prom-line)] px-3 py-2 text-sm"
                    >
                      <div>
                        <span className="font-medium text-[var(--prom-fg)]">
                          {ev.title || room?.name || "Prenotazione"}
                        </span>
                        <span className="ml-2 text-[var(--prom-muted)]">
                          {timeRangeLabel(start, end)}
                          {room ? ` · ${room.name}` : ""}
                        </span>
                      </div>
                      {bookingId ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={cancelId === bookingId}
                          onClick={() => void handleCancel(bookingId)}
                        >
                          {cancelId === bookingId ? (
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                          ) : (
                            "Annulla"
                          )}
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </HebbAiGlassPanel>
          ) : null}
        </section>
      ) : null}

      {step === "schedule" && selectedRoom ? (
        <section>
          <HebbAiGlassPanel>
            <p className="text-sm text-[var(--prom-muted)]">
              Sala selezionata: <strong className="text-[var(--prom-fg)]">{selectedRoom.name}</strong>
            </p>
            <label className="mt-4 block text-sm text-[var(--prom-muted)]" htmlFor="booking-day">
              Data
            </label>
            <input
              id="booking-day"
              type="date"
              className="mt-1 w-full max-w-xs rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-3 py-2 text-[var(--prom-fg)]"
              value={day}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDay(e.target.value)}
            />
            <p className="mt-2 text-sm text-[var(--prom-muted)]">{formatDayIt(day)}</p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm text-[var(--prom-muted)]" htmlFor="booking-start">
                  Ora inizio
                </label>
                <input
                  id="booking-start"
                  type="time"
                  step={300}
                  min={`${String(DAY_START_H).padStart(2, "0")}:00`}
                  max={`${String(DAY_END_H).padStart(2, "0")}:00`}
                  className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-3 py-2 text-[var(--prom-fg)]"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--prom-muted)]" htmlFor="booking-end">
                  Ora fine
                </label>
                <input
                  id="booking-end"
                  type="time"
                  step={300}
                  min={`${String(DAY_START_H).padStart(2, "0")}:00`}
                  max={`${String(DAY_END_H).padStart(2, "0")}:00`}
                  className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-3 py-2 text-[var(--prom-fg)]"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>

            {scheduledRange ? (
              <p className="mt-3 text-sm text-[var(--prom-fg)]">
                Intervallo: <strong>{scheduledRange.label}</strong> ({scheduledRange.durationMinutes} min)
              </p>
            ) : null}

            {scheduleError ? (
              <p className="mt-3 text-sm text-amber-200">{scheduleError}</p>
            ) : (
              <p className="mt-3 text-xs text-[var(--prom-muted)]">
                Scegli liberamente inizio e fine (min {MIN_DURATION_MIN} min, max {MAX_DURATION_H} h, fascia{" "}
                {DAY_START_H}:00–{DAY_END_H}:00).
              </p>
            )}

            {roomBookings.length > 0 ? (
              <div className="mt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">
                  Occupato in giornata
                </p>
                <ul className="mt-2 space-y-1 text-sm text-[var(--prom-muted)]">
                  {roomBookings.map((ev) => {
                    const start = new Date(String(ev.start));
                    const end = new Date(String(ev.end));
                    return (
                      <li key={ev.id}>
                        {timeRangeLabel(start, end)}
                        {ev.title ? ` · ${ev.title}` : ""}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            <Button
              type="button"
              className="mt-4 gap-2"
              disabled={Boolean(scheduleError)}
              onClick={() => setStep("confirm")}
            >
              <Calendar className="h-4 w-4" aria-hidden />
              Continua
            </Button>
          </HebbAiGlassPanel>
        </section>
      ) : null}

      {step === "confirm" && selectedRoom && scheduledRange ? (
        <section>
          <HebbAiGlassPanel>
            <h3 className="text-lg font-semibold text-[var(--prom-fg)]">Conferma prenotazione</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--prom-muted)]">Sala</dt>
                <dd className="text-right text-[var(--prom-fg)]">{selectedRoom.name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--prom-muted)]">Data</dt>
                <dd className="text-right text-[var(--prom-fg)]">{formatDayIt(day)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--prom-muted)]">Orario</dt>
                <dd className="text-right text-[var(--prom-fg)]">{scheduledRange.label}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--prom-muted)]">Durata</dt>
                <dd className="text-right text-[var(--prom-fg)]">{scheduledRange.durationMinutes} min</dd>
              </div>
            </dl>
            <HebbFieldAssistProvider
              formId="sale-riunioni.booking"
              partialForm={{ title, day, startTime, endTime }}
              context={{
                roomName: selectedRoom.name,
                slotLabel: scheduledRange.label,
                durationMinutes: scheduledRange.durationMinutes
              }}
            >
              <HebbInput
                label="Titolo (opzionale)"
                fieldKey="title"
                id="booking-title"
                maxLength={120}
                placeholder="Es. Stand-up team prodotto"
                className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-3 py-2 text-[var(--prom-fg)]"
                value={title}
                onChange={setTitle}
              />
            </HebbFieldAssistProvider>

            <div className="mt-4 space-y-3">
              <p className="text-sm font-medium text-[var(--prom-fg)]">Invita colleghi</p>
              {colleagues.length === 0 ? (
                <p className="text-xs text-[var(--prom-muted)]">Nessun collega disponibile in rubrica.</p>
              ) : (
                <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-[var(--prom-line)] p-2 text-sm">
                  {colleagues.map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={inviteeUserIds.includes(c.id)}
                          onChange={(e) => {
                            setInviteeUserIds((prev) =>
                              e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                            );
                          }}
                        />
                        <span className="text-[var(--prom-fg)]">{c.fullName}</span>
                        <span className="text-xs text-[var(--prom-muted)]">{c.email}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <label className="block text-sm text-[var(--prom-muted)]" htmlFor="invitee-emails">
                Email esterne (separate da virgola)
              </label>
              <input
                id="invitee-emails"
                type="text"
                placeholder="ospite@azienda.it, consulente@dominio.it"
                className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-3 py-2 text-sm text-[var(--prom-fg)]"
                value={inviteeEmailsRaw}
                onChange={(e) => setInviteeEmailsRaw(e.target.value)}
              />
            </div>

            {scheduleError ? (
              <p className="mt-4 text-sm text-amber-200">{scheduleError}</p>
            ) : null}

            <Button
              type="button"
              className="mt-6 gap-2"
              disabled={busy || Boolean(scheduleError)}
              onClick={() => void confirmBooking()}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Check className="h-4 w-4" aria-hidden />
              )}
              Conferma prenotazione
            </Button>
          </HebbAiGlassPanel>
        </section>
      ) : null}
    </NexaHrAppPage>
  );
}
