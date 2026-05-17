"use client";

import { ArrowLeft, Calendar, Check, Loader2, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cancelMeetingRoomBooking,
  createMeetingRoomBooking,
  fetchMeetingRoomBookingEvents,
  fetchMeetingRooms,
  type CalendarEventDto,
  type MeetingRoomDto
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { HebbAiGlassPanel, HebbAiGlassTile } from "@/components/hebb-ai-experience-shell";
import { NexaHrAppPage } from "@/components/nexa-hr-app-page";
import { Button } from "@/components/ui/button";

type Step = "room" | "date" | "slot" | "confirm";

const SLOT_MINUTES = 30;
const DAY_START_H = 8;
const DAY_END_H = 19;

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

function slotLabel(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

function buildDaySlots(dayIso: string): Array<{ startsAt: string; endsAt: string; label: string }> {
  const base = dayIso.slice(0, 10);
  const out: Array<{ startsAt: string; endsAt: string; label: string }> = [];
  for (let h = DAY_START_H; h < DAY_END_H; h++) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) {
      const endM = m + SLOT_MINUTES;
      const endH = endM >= 60 ? h + 1 : h;
      const endMin = endM >= 60 ? 0 : endM;
      if (endH > DAY_END_H || (endH === DAY_END_H && endMin > 0)) continue;
      const start = new Date(`${base}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
      const end = new Date(`${base}T${String(endH).padStart(2, "0")}:${String(endMin).padStart(2, "0")}:00`);
      out.push({
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        label: slotLabel(start, end)
      });
    }
  }
  return out;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function StepIndicator({ step }: { step: Step }): React.JSX.Element {
  const order: Step[] = ["room", "date", "slot", "confirm"];
  const idx = order.indexOf(step) + 1;
  return (
    <p className="mb-4 text-xs uppercase tracking-wide text-[var(--prom-muted)]" aria-live="polite">
      Passo {idx} di 4
    </p>
  );
}

export default function SaleRiunioniPage(): React.JSX.Element {
  const [step, setStep] = useState<Step>("room");
  const [rooms, setRooms] = useState<MeetingRoomDto[]>([]);
  const [bookings, setBookings] = useState<CalendarEventDto[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<MeetingRoomDto | null>(null);
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedSlot, setSelectedSlot] = useState<{ startsAt: string; endsAt: string; label: string } | null>(
    null
  );
  const [title, setTitle] = useState("");
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

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        await loadRooms();
        await loadBookings();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Caricamento non riuscito");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadRooms, loadBookings]);

  useEffect(() => {
    if (step === "slot" || step === "confirm") {
      void loadBookings().catch(() => setBookings([]));
    }
  }, [step, loadBookings]);

  const roomBookings = useMemo(() => {
    if (!selectedRoom) return [];
    return bookings.filter((ev) => String(ev.meta?.roomId ?? "") === selectedRoom.id);
  }, [bookings, selectedRoom]);

  const slots = useMemo(() => buildDaySlots(day), [day]);

  const availableSlots = useMemo(() => {
    return slots.filter((slot) => {
      return !roomBookings.some((ev) =>
        overlaps(slot.startsAt, slot.endsAt, String(ev.start), String(ev.end))
      );
    });
  }, [slots, roomBookings]);

  const myUpcoming = useMemo(() => {
    const now = Date.now();
    return bookings
      .filter((ev) => new Date(String(ev.end)).getTime() >= now)
      .sort((a, b) => String(a.start).localeCompare(String(b.start)))
      .slice(0, 8);
  }, [bookings]);

  const goBack = (): void => {
    if (step === "date") setStep("room");
    else if (step === "slot") setStep("date");
    else if (step === "confirm") setStep("slot");
  };

  const confirmBooking = async (): Promise<void> => {
    if (!selectedRoom || !selectedSlot) return;
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setErr(null);
    try {
      await createMeetingRoomBooking(token, selectedRoom.id, {
        startsAt: selectedSlot.startsAt,
        endsAt: selectedSlot.endsAt,
        title: title.trim() || `Riunione — ${selectedRoom.name}`
      });
      setTitle("");
      setSelectedSlot(null);
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
      subtitle="Scegli sala, giorno e orario. Le prenotazioni sono visibili in azienda."
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
                      setStep("date");
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
                          {slotLabel(start, end)}
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

      {step === "date" && selectedRoom ? (
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
            <Button type="button" className="mt-4 gap-2" onClick={() => setStep("slot")}>
              <Calendar className="h-4 w-4" aria-hidden />
              Scegli fascia oraria
            </Button>
          </HebbAiGlassPanel>
        </section>
      ) : null}

      {step === "slot" && selectedRoom ? (
        <section>
          <HebbAiGlassPanel>
            <p className="text-sm text-[var(--prom-muted)]">
              {selectedRoom.name} · {formatDayIt(day)}
            </p>
            {availableSlots.length === 0 ? (
              <p className="mt-4 text-sm text-amber-200">Nessuna fascia libera in questa giornata.</p>
            ) : (
              <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {availableSlots.map((slot) => (
                  <li key={slot.startsAt}>
                    <button
                      type="button"
                      className={`w-full rounded-lg border px-2 py-2 text-sm transition ${
                        selectedSlot?.startsAt === slot.startsAt
                          ? "border-[var(--prom-accent)] bg-[var(--prom-accent)]/15 text-[var(--prom-fg)]"
                          : "border-[var(--prom-line)] text-[var(--prom-muted)] hover:border-[var(--prom-accent)]/40"
                      }`}
                      onClick={() => {
                        setSelectedSlot(slot);
                        setStep("confirm");
                      }}
                    >
                      {slot.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </HebbAiGlassPanel>
        </section>
      ) : null}

      {step === "confirm" && selectedRoom && selectedSlot ? (
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
                <dd className="text-right text-[var(--prom-fg)]">{selectedSlot.label}</dd>
              </div>
            </dl>
            <label className="mt-4 block text-sm text-[var(--prom-muted)]" htmlFor="booking-title">
              Titolo (opzionale)
            </label>
            <input
              id="booking-title"
              type="text"
              maxLength={120}
              placeholder="Es. Stand-up team prodotto"
              className="mt-1 w-full rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-3 py-2 text-[var(--prom-fg)]"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Button
              type="button"
              className="mt-6 gap-2"
              disabled={busy}
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
