import type { ApprovalItem } from "@/lib/api";

export function hasInsufficientLeaveBalance(item: ApprovalItem): boolean {
  return Boolean(
    item.insufficientAnnualLeaveBalance ??
      (item.type === "leave" &&
        item.leaveKind === "annual" &&
        item.residualAnnualLeaveDays != null &&
        item.requestedCalendarDays != null &&
        item.residualAnnualLeaveDays < item.requestedCalendarDays)
  );
}

export function leaveBalanceShortfallDays(item: ApprovalItem): number {
  if (item.annualLeaveBalanceShortfallDays != null) {
    return item.annualLeaveBalanceShortfallDays;
  }
  if (!hasInsufficientLeaveBalance(item)) {
    return 0;
  }
  return (item.requestedCalendarDays ?? 0) - (item.residualAnnualLeaveDays ?? 0);
}

export function hasTeamZeroCoverageAlert(item: ApprovalItem): boolean {
  return Boolean(item.teamZeroCoverage);
}

export function leaveApprovalHasPreConfirmWarnings(item: ApprovalItem): boolean {
  return hasInsufficientLeaveBalance(item) || hasTeamZeroCoverageAlert(item);
}

export function buildLeaveApprovalConfirmMessage(item: ApprovalItem): string {
  const lines: string[] = ["Confermi l'approvazione?"];
  if (hasInsufficientLeaveBalance(item)) {
    const residual = item.residualAnnualLeaveDays ?? 0;
    const requested = item.requestedCalendarDays ?? 0;
    const shortfall = leaveBalanceShortfallDays(item);
    lines.push(
      `• Residuo ferie insufficiente: ${requested} gg richiesti, ${residual} gg disponibili (−${shortfall} gg).`
    );
  }
  if (hasTeamZeroCoverageAlert(item)) {
    const team = item.teamCoverageLabel ?? "Team";
    const zeroDays = item.teamCoverageZeroDays ?? 0;
    const peers = item.teamCoveragePeerCount ?? 0;
    lines.push(
      `• Copertura ${team}: ${zeroDays} giorno/i del periodo senza presenze (${peers} membri considerati).`
    );
  }
  return lines.join("\n");
}
