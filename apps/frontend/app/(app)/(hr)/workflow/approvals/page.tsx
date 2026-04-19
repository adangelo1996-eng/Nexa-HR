"use client";

import { type Dispatch, type SetStateAction, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  approveApproval,
  approveExpenseClaim,
  fetchApprovals,
  fetchCurrentUser,
  fetchExpenseWorkflow,
  rejectApproval,
  rejectExpenseClaim,
  type ApprovalItem,
  type ExpenseWorkflowRowDto
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { subscribePostgresTable } from "@/lib/supabase-realtime";
import { Button } from "@/components/ui/button";
import { WorkflowApprovalFlowDiagram } from "@/components/workflow-flow-diagram";
import { WorkflowExpenseRow } from "@/components/workflow-expense-row";
import {
  groupHistoryByRequestDayAndType,
  groupPendingApprovalsByCategory,
  isHighPriorityPending,
  partitionForWorkflow,
  sortMine,
  sortToApprove
} from "@/lib/workflow-approval-groups";

function requestTypeLabel(item: ApprovalItem): string {
  if (item.type === "leave") {
    return item.leaveKind === "rol" ? "ROL" : "Ferie annuali";
  }
  if (item.type === "sickness") {
    return "Malattia";
  }
  if (item.type === "travel") {
    return "Trasferta";
  }
  return "Remote working";
}

function historyTypeHeading(typeKey: string): string {
  if (typeKey === "leave:annual") {
    return "Ferie annuali";
  }
  if (typeKey === "leave:rol") {
    return "ROL";
  }
  if (typeKey === "sickness") {
    return "Malattia";
  }
  if (typeKey === "travel") {
    return "Trasferta";
  }
  return "Remote working";
}

function periodLabel(item: ApprovalItem): string {
  if (!item.startDate) {
    return "—";
  }
  if (item.endDate && item.endDate !== item.startDate) {
    return `${item.startDate} → ${item.endDate}`;
  }
  return item.startDate;
}

function initials(name: string | undefined): string {
  if (!name?.trim()) {
    return "?";
  }
  const p = name.trim().split(/\s+/);
  if (p.length === 1) {
    return p[0]!.slice(0, 2).toUpperCase();
  }
  return `${p[0]!.charAt(0)}${p[p.length - 1]!.charAt(0)}`.toUpperCase();
}

type RowVariant = "full" | "mine" | "history";

function ApprovalRow(props: {
  item: ApprovalItem;
  variant: RowVariant;
  focused: boolean;
  rowRef?: (el: HTMLDivElement | null) => void;
  reasons: Record<string, string>;
  setReasons: Dispatch<SetStateAction<Record<string, string>>>;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}): React.JSX.Element {
  const { item, variant, focused, rowRef, reasons, setReasons, onApprove, onReject } = props;
  const urgent = variant !== "history" && isHighPriorityPending(item);
  const showAvatar = true;
  const showMetrics = variant === "full";

  const shellClass = [
    "rounded-lg border border-[var(--prom-line)] p-4",
    variant === "history"
      ? "bg-[color-mix(in_srgb,var(--prom-surface-soft)_50%,transparent)]"
      : "bg-[color-mix(in_srgb,var(--prom-surface-soft)_75%,transparent)]",
    focused ? "ring-2 ring-[var(--prom-gold)] ring-offset-2 ring-offset-[var(--prom-surface)]" : "",
    urgent ? "border-amber-500/70 ring-1 ring-amber-500/40" : ""
  ].join(" ");

  return (
    <div ref={rowRef} className={shellClass}>
      <div className="flex flex-wrap items-start gap-3">
        {showAvatar ? (
          item.requesterPhotoUrl ? (
            <img src={item.requesterPhotoUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
          ) : (
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-muted)_18%,transparent)] text-xs font-semibold text-[var(--prom-text)]"
              aria-hidden
            >
              {initials(item.requesterName)}
            </div>
          )
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-[var(--prom-text)]">{item.requesterName ?? item.requestedBy}</p>
            {urgent ? (
              <span className="rounded bg-amber-200/90 px-2 py-0.5 text-xs font-medium text-amber-950 dark:bg-amber-800/80 dark:text-amber-100">
                Priorità alta
              </span>
            ) : null}
            <span
              className={`rounded px-2 py-0.5 text-xs ${
                item.status === "approved"
                  ? "bg-emerald-100/90 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200"
                  : item.status === "rejected"
                    ? "bg-rose-100/90 text-rose-900 dark:bg-rose-900/50 dark:text-rose-200"
                    : "bg-[color-mix(in_srgb,var(--prom-muted)_25%,transparent)] text-[var(--prom-text)]"
              }`}
            >
              {item.status}
            </span>
          </div>
          <p className="text-sm text-[var(--prom-muted)]">
            <span className="font-medium text-[var(--prom-text)]">{requestTypeLabel(item)}</span>
            <span className="mx-1.5 text-[var(--prom-line)]">·</span>
            <span>{periodLabel(item)}</span>
          </p>
          {showMetrics && item.type === "leave" && item.leaveKind === "annual" && item.residualAnnualLeaveDays != null ? (
            <p className="mt-1 text-xs text-[var(--prom-muted)]">
              Residuo ferie:{" "}
              <span className="font-medium text-[var(--prom-text)]">{item.residualAnnualLeaveDays} gg</span>
              {item.requestedCalendarDays != null ? (
                <> · richiesta {item.requestedCalendarDays} gg</>
              ) : null}
            </p>
          ) : null}
          {showMetrics && item.type === "leave" && item.leaveKind === "rol" && item.requestedCalendarDays != null ? (
            <p className="mt-1 text-xs text-[var(--prom-muted)]">
              ROL: {item.requestedCalendarDays} gg
            </p>
          ) : null}
          {showMetrics && item.type === "sickness" && item.requestedCalendarDays != null ? (
            <p className="mt-1 text-xs text-[var(--prom-muted)]">{item.requestedCalendarDays} gg</p>
          ) : null}
          {showMetrics && item.type === "travel" && item.requestedCalendarDays != null ? (
            <p className="mt-1 text-xs text-[var(--prom-muted)]">{item.requestedCalendarDays} gg</p>
          ) : null}
          {showMetrics && item.type === "smartworking" ? (
            <p
              className="mt-1 text-xs text-[var(--prom-muted)]"
              title="Conteggio su settimana lun–dom (UTC). Conteggiati solo stati non rifiutati."
            >
              SW:{" "}
              <span className="font-medium text-[var(--prom-text)]">
                {item.smartworkingWeekUsed ?? "—"}/{item.smartworkingWeekQuota ?? "—"}
              </span>{" "}
              (sett.) ·{" "}
              <span className="font-medium text-[var(--prom-text)]">
                {item.smartworkingMonthUsed ?? "—"}/{item.smartworkingMonthQuota ?? "—"}
              </span>{" "}
              (mese)
            </p>
          ) : null}
          {item.note ? <p className="mt-1 text-xs italic text-[var(--prom-muted)]">{item.note}</p> : null}
          <WorkflowApprovalFlowDiagram
            item={item}
            requesterLabel={item.requesterName ?? item.requestedBy}
            approverLabel={item.approverName}
          />
          {variant === "history" ? (
            <p className="mt-1 text-xs text-[var(--prom-muted)]">{new Date(item.at).toLocaleString("it-CH")}</p>
          ) : null}
        </div>
      </div>
      {variant === "full" ? (
        <>
          <input
            placeholder="Motivo rifiuto (opz.)"
            value={reasons[item.id] ?? ""}
            onChange={(e) => setReasons((r) => ({ ...r, [item.id]: e.target.value }))}
            className="mt-3 w-full max-w-md rounded border border-[var(--prom-line)] bg-transparent px-2 py-1 text-sm text-[var(--prom-text)]"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => onApprove(item.id)}>
              Approva
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => onReject(item.id)}>
              Rifiuta
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function WorkflowApprovalsContent(): React.JSX.Element {
  const searchParams = useSearchParams();
  const focusApprovalId = searchParams.get("approvalId");
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [expenseWf, setExpenseWf] = useState<{
    toApproveManager: ExpenseWorkflowRowDto[];
    toApproveHr: ExpenseWorkflowRowDto[];
    mine: ExpenseWorkflowRowDto[];
  } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [expenseBusyId, setExpenseBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      return;
    }
    setLoading(true);
    try {
      const [me, a, ew] = await Promise.all([
        fetchCurrentUser(token),
        fetchApprovals(token),
        fetchExpenseWorkflow(token).catch(() => null)
      ]);
      setCurrentUserId(me.id);
      setApprovals(a);
      setExpenseWf(
        ew ?? {
          toApproveManager: [],
          toApproveHr: [],
          mine: []
        }
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const { toApprove, mine, historyGrouped, expenseMineOpen, expenseHistory, mgr, hrQ } = useMemo(() => {
    if (!currentUserId) {
      return {
        toApprove: [] as ApprovalItem[],
        mine: [] as ApprovalItem[],
        historyGrouped: [] as ReturnType<typeof groupHistoryByRequestDayAndType>,
        expenseMineOpen: [] as ExpenseWorkflowRowDto[],
        expenseHistory: [] as ExpenseWorkflowRowDto[],
        mgr: [] as ExpenseWorkflowRowDto[],
        hrQ: [] as ExpenseWorkflowRowDto[]
      };
    }
    const { toApprove: rawA, mine: rawM, history } = partitionForWorkflow(approvals, currentUserId);
    const ew = expenseWf ?? { toApproveManager: [], toApproveHr: [], mine: [] };
    const expOpen = ew.mine.filter((r) => r.claim.status === "submitted" || r.claim.status === "pending_hr");
    const expHist = ew.mine
      .filter((r) => ["approved", "rejected", "paid"].includes(r.claim.status))
      .sort((a, b) => (b.claim.createdAt ?? "").localeCompare(a.claim.createdAt ?? ""));
    return {
      toApprove: sortToApprove(rawA),
      mine: sortMine(rawM),
      historyGrouped: groupHistoryByRequestDayAndType(history),
      expenseMineOpen: expOpen,
      expenseHistory: expHist,
      mgr: ew.toApproveManager,
      hrQ: ew.toApproveHr
    };
  }, [approvals, currentUserId, expenseWf]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const a = subscribePostgresTable("approvals", () => void load());
    const s = subscribePostgresTable("smartworking_requests", () => void load());
    const t = subscribePostgresTable("travel_requests", () => void load());
    const e = subscribePostgresTable("expense_claims", () => void load());
    return (): void => {
      a.unsubscribe();
      s.unsubscribe();
      t.unsubscribe();
      e.unsubscribe();
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

  async function onExpenseDecision(claimId: string, action: "approve" | "reject"): Promise<void> {
    const token = getToken();
    if (!token) {
      return;
    }
    setExpenseBusyId(claimId);
    try {
      if (action === "approve") {
        await approveExpenseClaim(token, claimId);
      } else {
        await rejectExpenseClaim(token, claimId);
      }
      await load();
    } finally {
      setExpenseBusyId(null);
    }
  }

  const pendingExpenseCount = mgr.length + hrQ.length;
  const pendingTotal = toApprove.length + pendingExpenseCount;

  const absencePendingGroups = useMemo(
    () => groupPendingApprovalsByCategory(toApprove),
    [toApprove]
  );

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-xl font-semibold text-[var(--prom-text)]">Approvazioni</h1>
      </header>
      {loading ? <p className="text-sm text-[var(--prom-muted)]">Caricamento…</p> : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--prom-text)]">In sospeso</h2>
        {pendingTotal === 0 ? (
          <p className="text-sm text-[var(--prom-muted)]">Nessuna richiesta.</p>
        ) : (
          <div className="space-y-8">
            {toApprove.length > 0 ? (
              <div className="space-y-6">
                {absencePendingGroups.map(({ typeKey, items }) =>
                    items.length === 0 ? null : (
                      <div key={typeKey} className="space-y-3">
                        <h3 className="text-sm font-medium text-[var(--prom-muted)]">
                          {historyTypeHeading(typeKey)}
                        </h3>
                        <ul className="space-y-3">
                          {items.map((item) => {
                            const focused = focusApprovalId === item.id;
                            return (
                              <li key={item.id}>
                                <ApprovalRow
                                  item={item}
                                  variant="full"
                                  focused={focused}
                                  rowRef={(el) => {
                                    rowRefs.current[item.id] = el;
                                  }}
                                  reasons={reasons}
                                  setReasons={setReasons}
                                  onApprove={(id) => void onApproveA(id)}
                                  onReject={(id) => void onRejectA(id)}
                                />
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )
                  )}
              </div>
            ) : null}
            {mgr.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-[var(--prom-text)]">Spese · responsabile</h3>
                <ul className="space-y-3">
                  {mgr.map((row) => (
                    <li key={`exp-mgr-${row.claim.id}`}>
                      <WorkflowExpenseRow
                        row={row}
                        variant="queue_manager"
                        showActions
                        busy={expenseBusyId === row.claim.id}
                        onApprove={() => void onExpenseDecision(row.claim.id, "approve")}
                        onReject={() => void onExpenseDecision(row.claim.id, "reject")}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {hrQ.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-[var(--prom-text)]">Spese · HR</h3>
                <ul className="space-y-3">
                  {hrQ.map((row) => (
                    <li key={`exp-hr-${row.claim.id}`}>
                      <WorkflowExpenseRow
                        row={row}
                        variant="queue_hr"
                        showActions
                        busy={expenseBusyId === row.claim.id}
                        onApprove={() => void onExpenseDecision(row.claim.id, "approve")}
                        onReject={() => void onExpenseDecision(row.claim.id, "reject")}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--prom-text)]">Le mie richieste</h2>
        {mine.length === 0 && expenseMineOpen.length === 0 ? (
          <p className="text-sm text-[var(--prom-muted)]">Nessuna richiesta aperta.</p>
        ) : (
          <ul className="space-y-3">
            {mine.map((item) => (
              <li key={item.id}>
                <ApprovalRow
                  item={item}
                  variant="mine"
                  focused={focusApprovalId === item.id}
                  rowRef={(el) => {
                    rowRefs.current[item.id] = el;
                  }}
                  reasons={reasons}
                  setReasons={setReasons}
                  onApprove={(id) => void onApproveA(id)}
                  onReject={(id) => void onRejectA(id)}
                />
              </li>
            ))}
            {expenseMineOpen.map((row) => (
              <li key={`exp-open-${row.claim.id}`}>
                <WorkflowExpenseRow row={row} variant="mine" showActions={false} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--prom-text)]">Storico</h2>
        {historyGrouped.length === 0 && expenseHistory.length === 0 ? (
          <p className="text-sm text-[var(--prom-muted)]">Vuoto.</p>
        ) : (
          <div className="space-y-8">
            {historyGrouped.map(({ day, typeGroups }) => (
              <div key={day}>
                <h3 className="border-b border-[var(--prom-line)] pb-1 text-base font-medium text-[var(--prom-text)]">
                  {day === "—" ? "Senza data" : day}
                </h3>
                <div className="mt-3 space-y-6">
                  {typeGroups.map(({ typeKey, items }) => (
                    <div key={`${day}-${typeKey}`}>
                      <h4 className="text-xs font-medium text-[var(--prom-muted)]">{historyTypeHeading(typeKey)}</h4>
                      <ul className="mt-2 space-y-2">
                        {items.map((item) => (
                          <li key={item.id}>
                            <ApprovalRow
                              item={item}
                              variant="history"
                              focused={focusApprovalId === item.id}
                              rowRef={(el) => {
                                rowRefs.current[item.id] = el;
                              }}
                              reasons={reasons}
                              setReasons={setReasons}
                              onApprove={(id) => void onApproveA(id)}
                              onReject={(id) => void onRejectA(id)}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {expenseHistory.length > 0 ? (
              <div>
                <h3 className="border-b border-[var(--prom-line)] pb-1 text-sm font-medium text-[var(--prom-text)]">
                  Spese concluse
                </h3>
                <ul className="mt-3 space-y-2">
                  {expenseHistory.map((row) => (
                    <li key={`exp-h-${row.claim.id}`}>
                      <WorkflowExpenseRow row={row} variant="history" showActions={false} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
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
