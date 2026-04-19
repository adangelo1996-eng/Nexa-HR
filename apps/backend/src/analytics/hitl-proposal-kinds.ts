/** Catalogo tipi proposta HITL (codice persistito + testi per LLM e UI). */
export const HITL_PROPOSAL_KIND_CATALOG: ReadonlyArray<{
  id: string;
  labelIt: string;
  hintIt: string;
}> = [
  {
    id: "reminder.leave_balance",
    labelIt: "Promemoria saldo ferie",
    hintIt: "Messaggio gentile al dipendente sul residuo ferie; nessun dato finanziario sensibile."
  },
  {
    id: "reminder.pending_approvals",
    labelIt: "Sollecito approvazioni in sospeso",
    hintIt: "Per responsabili: richieste ferie/spese/smart working ancora da gestire nel proprio perimetro."
  },
  {
    id: "info.policy_pointer",
    labelIt: "Indicazione policy / percorso self-service",
    hintIt: "Puntare a corporate policy o modulo già esistente, senza modificare contratti o cedolini."
  }
];

export function hitlProposalKindIds(): string[] {
  return HITL_PROPOSAL_KIND_CATALOG.map((k) => k.id);
}
