"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { approveApproval, fetchApprovals, rejectApproval, type ApprovalItem } from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { subscribePostgresTable } from "@/lib/supabase-realtime";
import { Button } from "@/components/ui/button";

function requestTypeLabel(item: ApprovalItem): string {
  if (item.type === "leave") {
    return item.leaveKind === "rol" ? "ROL" : "Ferie annuali";
  }
  if (item.type === "sickness") return "Malattia";
  return "Smart working";
}

function periodLabel(item: ApprovalItem): string {
  if (!item.startDate) return "—";
  if (item.endDate && item.endDate !== item.startDate) {
    return `${item.startDate} → ${item.endDate}`;
  }
  return item.startDate;
}

function initials(name: string | undefined): string {
  if (!name?.trim()) return "?";
  const p = name.trim().split(/\s+/);
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return `${p[0]!.charAt(0)}${p[p.length - 1]!.charAt(0)}`.toUpperCase();
}

function WorkflowApprovalsContent(): React.JSX.Element {
  const searchParams = useSearchParams();
  const focusApprovalId = searchParams.get("approvalId");
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      return;
    }
    setLoading(true);
    try {
      const a = await fetchApprovals(token, "pending");
      setApprovals(a);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const a = subscribePostgresTable("approvals", () => void load());
    const s = subscribePostgresTable("smartworking_requests", () => void load());
    return (): void => {
      a.unsubscribe();
      s.unsubscribe();
    };
  }, [load]);

  useEffect(() => {
    if (!focusApprovalId || loading) {
      return;
    }
    const el = rowRefs.current[focusApprovalId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusApprovalId, loading, approvals]);

  async function onApproveA(id: string): Promise<void> {
    const token = getToken();
    if (!token) {
      return;
    }
    await approveApproval(token, id);
    void load();
  }

  async function onRejectA(id: string): Promise<void> {
    const token = getToken();
    if (!token) {
      return;
    }
    await rejectApproval(token, id, { reason: reasons[id] || undefined });
    void load();
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-xl font-semibold text-[var(--prom-text)]">Approvazioni team</h1>
        <p className="text-sm text-[var(--prom-muted)]">
          Ferie, ROL, malattia e smart working in un unico flusso. Ogni riga mostra saldo ferie (fino
          all&apos;anno della richiesta) e utilizzo smart working per settimana e mese della data richiesta.
        </p>
      </header>
      {loading ? <p className="text-sm text-[var(--prom-muted)]">Caricamento…</p> : null}

      <section className="space-y-3">
        {approvals.length === 0 ? (
          <p className="text-sm text-[var(--prom-muted)]">Nessuna richiesta in attesa.</p>
        ) : (
          <ul className="space-y-3">
            {approvals.map((item) => {
              const focused = focusApprovalId === item.id;
              return (
                <li key={item.id}>
                  <div
                    ref={(el) => {
                      rowRefs.current[item.id] = el;
                    }}
                    className={[
                      "rounded-lg border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_75%,transparent)] p-4",
                      focused ? "ring-2 ring-[var(--prom-gold)] ring-offset-2 ring-offset-[var(--prom-surface)]" : ""
                    ].join(" ")}
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      {item.requesterPhotoUrl ? (
                        <img
                          src={item.requesterPhotoUrl}
                          alt=""
                          className="h-11 w-11 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-muted)_18%,transparent)] text-xs font-semibold text-[var(--prom-text)]"
                          aria-hidden
                        >
                          {initials(item.requesterName)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-[var(--prom-text)]">
                          {item.requesterName ?? item.requestedBy}
                        </p>
                        <p className="text-sm text-[var(--prom-muted)]">
                          <span className="font-medium text-[var(--prom-text)]">{requestTypeLabel(item)}</span>
                          <span className="mx-1.5 text-[var(--prom-line)]">·</span>
                          <span>{periodLabel(item)}</span>
                        </p>
                        {item.type === "leave" && item.leaveKind === "annual" && item.residualAnnualLeaveDays != null ? (
                          <p className="mt-1 text-xs text-[var(--prom-muted)]">
                            Saldo ferie annuali (anno della richiesta):{" "}
                            <span className="font-medium text-[var(--prom-text)]">
                              {item.residualAnnualLeaveDays} giorni residui
                            </span>
                            {item.requestedCalendarDays != null ? (
                              <>
                                {" "}
                                · richiesta: {item.requestedCalendarDays} giorni calendario
                              </>
                            ) : null}
                          </p>
                        ) : null}
                        {item.type === "leave" && item.leaveKind === "rol" && item.requestedCalendarDays != null ? (
                          <p className="mt-1 text-xs text-[var(--prom-muted)]">
                            Richiesta ROL: {item.requestedCalendarDays} giorni calendario
                          </p>
                        ) : null}
                        {item.type === "sickness" && item.requestedCalendarDays != null ? (
                          <p className="mt-1 text-xs text-[var(--prom-muted)]">
                            Durata: {item.requestedCalendarDays} giorni calendario
                          </p>
                        ) : null}
                        {item.type === "smartworking" ? (
                          <p
                            className="mt-1 text-xs text-[var(--prom-muted)]"
                            title="Il conteggio settimanale usa la settimana da lunedì a domenica in UTC (può differire di un giorno rispetto al fuso locale). Contano solo richieste non rifiutate (pending o approvate), inclusa questa in valutazione."
                          >
                            Settimana della data richiesta (lun–dom,{" "}
                            <abbr title="Coordinated Universal Time: il confine della settimana segue il calendario UTC, non il fuso italiano." className="cursor-help underline decoration-dotted">
                              UTC
                            </abbr>
                            ):{" "}
                            <span className="font-medium text-[var(--prom-text)]">
                              {item.smartworkingWeekUsed ?? "—"} usati / {item.smartworkingWeekQuota ?? "—"} ammessi
                            </span>{" "}
                            nello smart working (pending o approvati; i rifiutati non contano).
                            {" · "}
                            Mese (stesso criterio):{" "}
                            <span className="font-medium text-[var(--prom-text)]">
                              {item.smartworkingMonthUsed ?? "—"} / {item.smartworkingMonthQuota ?? "—"}
                            </span>{" "}
                            giorni con SW (max mensile).
                          </p>
                        ) : null}
                        {item.note ? (
                          <p className="mt-1 text-xs italic text-[var(--prom-muted)]">{item.note}</p>
                        ) : null}
                      </div>
                    </div>
                    <input
                      placeholder="Motivo rifiuto (opz.)"
                      value={reasons[item.id] ?? ""}
                      onChange={(e) => setReasons((r) => ({ ...r, [item.id]: e.target.value }))}
                      className="mt-3 w-full max-w-md rounded border border-[var(--prom-line)] bg-transparent px-2 py-1 text-sm text-[var(--prom-text)]"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button type="button" size="sm" onClick={() => void onApproveA(item.id)}>
                        Approva
                      </Button>
                      <Button type="button" size="sm" variant="secondary" onClick={() => void onRejectA(item.id)}>
                        Rifiuta
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function WorkflowApprovalsPage(): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="p-4 text-sm text-[var(--prom-muted)]">Caricamento approvazioni…</div>
      }
    >
      <WorkflowApprovalsContent />
    </Suspense>
  );
}
