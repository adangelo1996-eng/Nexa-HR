/** Allineato a `apps/backend/src/analytics/hitl-proposal-kinds.ts` (codici persistiti). */
export const HITL_PROPOSAL_KIND_CATALOG = [
  {
    id: "reminder.leave_balance",
    labelIt: "Promemoria saldo ferie",
    hintIt: "Messaggio gentile sul residuo ferie; nessun dato finanziario sensibile."
  },
  {
    id: "reminder.pending_approvals",
    labelIt: "Sollecito approvazioni in sospeso",
    hintIt: "Per responsabili: ferie, spese o remote working ancora da gestire nel proprio perimetro."
  },
  {
    id: "info.policy_pointer",
    labelIt: "Indicazione policy / percorso self-service",
    hintIt: "Puntare a policy o modulo esistente, senza modificare contratti o cedolini."
  }
] as const;
