"use client";

import type { ApprovalItem, ExpenseClaimDto } from "@/lib/api";

type StepState = "done" | "current" | "pending" | "rejected" | "skipped";

function StepBox(props: {
  title: string;
  subtitle?: string;
  state: StepState;
  className?: string;
}): React.JSX.Element {
  const { title, subtitle, state, className } = props;
  const border =
    state === "current"
      ? "border-[color-mix(in_srgb,var(--prom-gold)_55%,var(--prom-line))] ring-2 ring-[color-mix(in_srgb,var(--prom-gold)_35%,transparent)]"
      : state === "done"
        ? "border-emerald-600/50 bg-emerald-500/10 dark:border-emerald-500/50 dark:bg-emerald-900/20"
        : state === "rejected"
          ? "border-rose-500/60 bg-rose-500/10 dark:bg-rose-900/25"
          : state === "skipped"
            ? "border-dashed border-[var(--prom-line)] opacity-70"
            : "border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_60%,transparent)]";
  return (
    <div className={`min-w-[7.5rem] max-w-[11rem] rounded-lg border px-2.5 py-2 text-center ${border} ${className ?? ""}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">{title}</p>
      <p className="mt-0.5 text-xs font-medium leading-snug text-[var(--prom-text)]">{subtitle ?? "—"}</p>
    </div>
  );
}

function Arrow(): React.JSX.Element {
  return (
    <span className="px-0.5 text-lg font-light text-[var(--prom-muted)]" aria-hidden>
      →
    </span>
  );
}

function skipManagerStep(claim: ExpenseClaimDto): boolean {
  return !claim.managerApprovedBy && !claim.managerApprovedAt;
}

/** Flusso nota spesa: richiedente → responsabile (opzionale) → HR → esito. */
export function WorkflowExpenseFlowDiagram(props: {
  claim: ExpenseClaimDto;
  requesterLabel: string;
  managerLabel?: string | null;
  /** `stacked`: riga completa per «Esito» sotto Richiesta → Responsabile → HR. */
  variant?: "default" | "stacked";
}): React.JSX.Element {
  const { claim, requesterLabel, managerLabel, variant = "default" } = props;
  const skipMgr =
    skipManagerStep(claim) &&
    (claim.status === "pending_hr" || claim.status === "approved" || claim.status === "paid");

  let managerState: StepState;
  let mgrSub: string;
  let hrState: StepState;
  let hrSub: string;
  let outcomeState: StepState;
  let outcomeLabel: string;

  switch (claim.status) {
    case "submitted":
      managerState = "current";
      mgrSub = managerLabel?.trim() || "In attesa";
      hrState = "pending";
      hrSub = "—";
      outcomeState = "pending";
      outcomeLabel = "In corso";
      break;
    case "pending_hr":
      if (skipMgr) {
        managerState = "skipped";
        mgrSub = "Non richiesto";
      } else {
        managerState = "done";
        mgrSub = managerLabel?.trim() || "Ok responsabile";
      }
      hrState = "current";
      hrSub = "In attesa";
      outcomeState = "pending";
      outcomeLabel = "In corso";
      break;
    case "approved":
    case "paid":
      if (skipMgr) {
        managerState = "skipped";
        mgrSub = "Non richiesto";
      } else {
        managerState = "done";
        mgrSub = managerLabel?.trim() || "Ok responsabile";
      }
      hrState = "done";
      hrSub = "Ok";
      outcomeState = "done";
      outcomeLabel = claim.status === "paid" ? "Pagata" : "Approvata";
      break;
    case "rejected":
      outcomeState = "rejected";
      outcomeLabel = "Rifiutata";
      if (claim.managerApprovedAt || claim.managerApprovedBy) {
        managerState = "done";
        mgrSub = managerLabel?.trim() || "Ok responsabile";
        hrState = "rejected";
        hrSub = "Rifiuto";
      } else {
        managerState = "rejected";
        mgrSub = managerLabel?.trim() || "Rifiuto";
        hrState = "pending";
        hrSub = "—";
      }
      break;
    default:
      managerState = "pending";
      mgrSub = managerLabel?.trim() || "—";
      hrState = "pending";
      hrSub = "—";
      outcomeState = "pending";
      outcomeLabel = claim.status === "draft" ? "Bozza" : "—";
  }

  const mainRow = (
    <>
      <StepBox title="Richiesta" subtitle={requesterLabel} state="done" />
      <Arrow />
      <StepBox title="Responsabile" subtitle={mgrSub} state={managerState} />
      <Arrow />
      <StepBox title="HR" subtitle={hrSub} state={hrState} />
    </>
  );

  if (variant === "stacked") {
    return (
      <div className="mt-3 space-y-2" role="img" aria-label="Flusso approvazione nota spesa">
        <div className="flex flex-wrap items-center justify-center gap-0.5 sm:justify-start">{mainRow}</div>
        <div className="flex w-full justify-center sm:justify-start">
          <StepBox
            title="Esito"
            subtitle={outcomeLabel}
            state={outcomeState}
            className="max-w-none min-w-0 w-full sm:w-auto sm:min-w-[10rem] sm:max-w-[28rem]"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="mt-3 flex flex-wrap items-center justify-center gap-0.5 sm:justify-start"
      role="img"
      aria-label="Flusso approvazione nota spesa"
    >
      {mainRow}
      <Arrow />
      <StepBox title="Esito" subtitle={outcomeLabel} state={outcomeState} />
    </div>
  );
}

/** Flusso richiesta ferie / SW / trasferta (singolo approvatore su tabella approvals). */
export function WorkflowApprovalFlowDiagram(props: {
  item: ApprovalItem;
  requesterLabel: string;
  approverLabel?: string | null;
}): React.JSX.Element {
  const { item, requesterLabel, approverLabel } = props;
  const pending = item.status === "pending";
  const ok = item.status === "approved";
  const rej = item.status === "rejected";

  const rState: StepState = pending || ok || rej ? "done" : "current";
  const aState: StepState = pending ? "current" : ok ? "done" : rej ? "rejected" : "pending";
  const oState: StepState = ok ? "done" : rej ? "rejected" : "pending";
  const outcomeSub = ok ? "Approvata" : rej ? "Rifiutata" : "In corso";

  return (
    <div
      className="mt-3 flex flex-wrap items-center justify-center gap-0.5 sm:justify-start"
      role="img"
      aria-label="Flusso approvazione richiesta"
    >
      <StepBox title="Richiesta" subtitle={requesterLabel} state={rState} />
      <Arrow />
      <StepBox
        title="Approvatore"
        subtitle={approverLabel?.trim() || (pending ? "In attesa" : "—")}
        state={aState}
      />
      <Arrow />
      <StepBox title="Esito" subtitle={outcomeSub} state={oState} />
    </div>
  );
}
