"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { WorkflowApprovalFlowDiagram } from "@/components/workflow-flow-diagram";
import { WorkflowExpenseRow } from "@/components/workflow-expense-row";
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
import {
  clearSession,
  getToken,
  sessionCanNexaAdmin,
  type SessionUser
} from "@/lib/auth-session";
import {
  groupHistoryByRequestDayAndType,
  isHighPriorityPending,
  partitionForWorkflow,
  sortMine,
  sortToApprove
} from "@/lib/workflow-approval-groups";

function requestTypeLabel(item: ApprovalItem): string {
  if (item.type === "leave") {
    return item.leaveKind === "rol" ? "Richiesta ROL" : "Richiesta ferie";
  }
  if (item.type === "sickness") {
    return "Comunicazione malattia";
  }
  if (item.type === "travel") {
    return "Trasferta";
  }
  return "Smart working";
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
  return "Smart working";
}

export default function WorkflowPage(): React.JSX.Element {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [expenseWf, setExpenseWf] = useState<{
    toApproveManager: ExpenseWorkflowRowDto[];
    toApproveHr: ExpenseWorkflowRowDto[];
    mine: ExpenseWorkflowRowDto[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { toApprove, mine, historyGrouped } = useMemo(() => {
    if (!user?.id) {
      return { toApprove: [] as ApprovalItem[], mine: [] as ApprovalItem[], historyGrouped: [] };
    }
    const { toApprove: rawA, mine: rawM, history } = partitionForWorkflow(approvals, user.id);
    return {
      toApprove: sortToApprove(rawA),
      mine: sortMine(rawM),
      historyGrouped: groupHistoryByRequestDayAndType(history)
    };
  }, [approvals, user?.id]);

  const expenseMineOpen = useMemo(() => {
    if (!expenseWf) {
      return [] as ExpenseWorkflowRowDto[];
    }
    return expenseWf.mine.filter((r) => r.claim.status === "submitted" || r.claim.status === "pending_hr");
  }, [expenseWf]);

  const expenseHistory = useMemo(() => {
    if (!expenseWf) {
      return [] as ExpenseWorkflowRowDto[];
    }
    return expenseWf.mine
      .filter((r) => ["approved", "rejected", "paid"].includes(r.claim.status))
      .sort((a, b) => (b.claim.createdAt ?? "").localeCompare(a.claim.createdAt ?? ""));
  }, [expenseWf]);

  useEffect(() => {
    const currentToken = getToken();
    if (!currentToken) {
      router.replace("/login");
      return;
    }
    const tokenValue = currentToken;
    setToken(tokenValue);

    async function load(): Promise<void> {
      try {
        const me = await fetchCurrentUser(tokenValue);
        const [list, ew] = await Promise.all([
          fetchApprovals(tokenValue),
          fetchExpenseWorkflow(tokenValue).catch(() => null)
        ]);
        setUser(me);
        setApprovals(list);
        setExpenseWf(
          ew ?? {
            toApproveManager: [],
            toApproveHr: [],
            mine: []
          }
        );
      } catch (loadError) {
        clearSession();
        router.replace("/login");
        setError(loadError instanceof Error ? loadError.message : "Errore caricamento workflow");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [router]);

  async function refresh(): Promise<void> {
    if (!token) {
      return;
    }
    const [list, ew] = await Promise.all([
      fetchApprovals(token),
      fetchExpenseWorkflow(token).catch(() => null)
    ]);
    setApprovals(list);
    if (ew) {
      setExpenseWf(ew);
    }
  }

  async function onAction(approvalId: string, action: "approve" | "reject"): Promise<void> {
    if (!token) {
      return;
    }
    setBusyId(approvalId);
    setError(null);
    try {
      if (action === "approve") {
        await approveApproval(token, approvalId);
      } else {
        await rejectApproval(token, approvalId);
      }
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore aggiornamento autorizzazione");
    } finally {
      setBusyId(null);
    }
  }

  async function onExpenseAction(claimId: string, action: "approve" | "reject"): Promise<void> {
    if (!token) {
      return;
    }
    setBusyId(`exp:${claimId}`);
    setError(null);
    try {
      if (action === "approve") {
        await approveExpenseClaim(token, claimId);
      } else {
        await rejectExpenseClaim(token, claimId);
      }
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore nota spesa");
    } finally {
      setBusyId(null);
    }
  }

  function renderCard(
    item: ApprovalItem,
    opts: { showActions: boolean; showPriority: boolean; compact?: boolean; showRequester?: boolean }
  ): React.JSX.Element {
    const urgent = opts.showPriority && isHighPriorityPending(item);
    return (
      <article
        className={`rounded-lg border p-3 dark:border-slate-700 ${
          urgent
            ? "border-amber-400 bg-amber-50/80 dark:border-amber-600/60 dark:bg-amber-950/25"
            : "border-slate-200 dark:border-slate-700"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium text-slate-900 dark:text-slate-100">{requestTypeLabel(item)}</p>
          <div className="flex flex-wrap items-center gap-2">
            {urgent ? (
              <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-950 dark:bg-amber-800/80 dark:text-amber-100">
                Priorità alta
              </span>
            ) : null}
            <span
              className={`rounded px-2 py-1 text-xs ${
                item.status === "approved"
                  ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-200"
                  : item.status === "rejected"
                    ? "bg-rose-100 text-rose-900 dark:bg-rose-900/60 dark:text-rose-200"
                    : "bg-slate-200 text-slate-800 dark:bg-[#2a3f4d]/70 dark:text-[#c5dde8]"
              }`}
            >
              {item.status}
            </span>
          </div>
        </div>
        {!opts.compact || opts.showRequester ? (
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Dipendente / richiedente: {item.requesterName ?? item.requestedBy}
          </p>
        ) : null}
        {item.startDate ? (
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Periodo: {item.startDate}
            {item.endDate && item.endDate !== item.startDate ? ` → ${item.endDate}` : ""}
          </p>
        ) : null}
        <WorkflowApprovalFlowDiagram
          item={item}
          requesterLabel={item.requesterName ?? item.requestedBy}
          approverLabel={item.approverName}
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">{new Date(item.at).toLocaleString("it-CH")}</p>
        {opts.showActions ? (
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={() => void onAction(item.id, "approve")}
              disabled={busyId === item.id}
              className="bg-emerald-400 text-slate-900 hover:bg-emerald-300"
            >
              Approva
            </Button>
            <Button
              size="sm"
              onClick={() => void onAction(item.id, "reject")}
              disabled={busyId === item.id}
              className="bg-rose-300 text-slate-900 hover:bg-rose-200"
            >
              Nega
            </Button>
          </div>
        ) : null}
      </article>
    );
  }

  const mgr = expenseWf?.toApproveManager ?? [];
  const hrQ = expenseWf?.toApproveHr ?? [];
  const pendingTotal = toApprove.length + mgr.length + hrQ.length;

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <p className="text-slate-700 dark:text-slate-300">Caricamento workflow...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Workflow autorizzazioni</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Vista di richieste dei sottoposti per {user?.fullName} ({user?.role}).
          </p>
        </div>
        <Link href="/" className="synapse-nav-link">
          Torna alla dashboard
        </Link>
      </header>

      <div className="space-y-10">
        <section className="card">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Approvazioni in sospeso</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Ferie/malattia/SW/trasferte e note spese: azioni per responsabile o HR. Priorità alta sulle assenze se la data
            richiesta è entro due giorni o è già passata.
          </p>
          <div className="mt-4 space-y-3">
            {pendingTotal === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">Nessuna richiesta in attesa.</p>
            ) : null}
            {toApprove.map((item) => (
              <Fragment key={item.id}>{renderCard(item, { showActions: true, showPriority: true })}</Fragment>
            ))}
            {mgr.map((row) => (
              <WorkflowExpenseRow
                key={`exp-mgr-${row.claim.id}`}
                row={row}
                variant="queue_manager"
                showActions
                busy={busyId === `exp:${row.claim.id}`}
                onApprove={() => void onExpenseAction(row.claim.id, "approve")}
                onReject={() => void onExpenseAction(row.claim.id, "reject")}
              />
            ))}
            {hrQ.map((row) => (
              <WorkflowExpenseRow
                key={`exp-hr-${row.claim.id}`}
                row={row}
                variant="queue_hr"
                showActions
                busy={busyId === `exp:${row.claim.id}`}
                onApprove={() => void onExpenseAction(row.claim.id, "approve")}
                onReject={() => void onExpenseAction(row.claim.id, "reject")}
              />
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Le mie richieste in corso</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Richieste inviate da te ancora in sospeso.</p>
          <div className="mt-4 space-y-3">
            {mine.length === 0 && expenseMineOpen.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">Nessuna richiesta aperta da te.</p>
            ) : null}
            {mine.map((item) => (
              <Fragment key={item.id}>{renderCard(item, { showActions: false, showPriority: true, compact: true })}</Fragment>
            ))}
            {expenseMineOpen.map((row) => (
              <WorkflowExpenseRow key={`exp-mine-${row.claim.id}`} row={row} variant="mine" showActions={false} />
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Storico</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Approvate e rifiutate (assenze/SW/trasferte), più note spese concluse.
          </p>
          <div className="mt-4 space-y-8">
            {historyGrouped.length === 0 && expenseHistory.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">Nessuno storico disponibile.</p>
            ) : null}
            {historyGrouped.map(({ day, typeGroups }) => (
              <div key={day}>
                <h3 className="border-b border-slate-200 pb-1 text-base font-medium text-slate-800 dark:border-slate-600 dark:text-slate-200">
                  {day === "—" ? "Senza data" : day}
                </h3>
                <div className="mt-3 space-y-6">
                  {typeGroups.map(({ typeKey, items }) => (
                    <div key={`${day}-${typeKey}`}>
                      <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {historyTypeHeading(typeKey)}
                      </h4>
                      <div className="mt-2 space-y-2">
                        {items.map((item) => (
                          <Fragment key={item.id}>
                            {renderCard(item, {
                              showActions: false,
                              showPriority: false,
                              compact: true,
                              showRequester:
                                Boolean(user && (sessionCanNexaAdmin(user) || user.role === "superuser"))
                            })}
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {expenseHistory.length > 0 ? (
              <div>
                <h3 className="border-b border-slate-200 pb-1 text-base font-medium text-slate-800 dark:border-slate-600 dark:text-slate-200">
                  Note spese (concluse)
                </h3>
                <div className="mt-3 space-y-2">
                  {expenseHistory.map((row) => (
                    <WorkflowExpenseRow key={`exp-hist-${row.claim.id}`} row={row} variant="history" showActions={false} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
      {error ? <p className="mt-6 text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}
    </main>
  );
}
