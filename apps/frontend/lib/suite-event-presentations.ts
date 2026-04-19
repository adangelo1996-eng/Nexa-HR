/** Etichette user-friendly per gli id evento del catalogo suite (allineato a `suite-contracts.ts`). */
const SUITE_EVENT_TITLES: Record<string, string> = {
  "nexa.hr.aggregates.turnover_weekly.v1": "Turnover — serie settimanale aggregata",
  "nexa.hr.aggregates.workforce_cockpit.v1": "Workforce — numeri cockpit (headcount e costi)",
  "nexa.hr.aggregates.skills_gap_summary.v1": "Skills — riepilogo gap per ruolo"
};

export function suiteAggregateEventTitle(id: string): string {
  return SUITE_EVENT_TITLES[id] ?? id;
}
