/**
 * Contratti read-only per integrazioni Plasticity / Central Hub (snapshot aggregati).
 * Non contiene segreti né URL: solo identificativi logici di evento e note di schema.
 */
export const NEXA_HR_SUITE_AGGREGATE_EVENTS = [
  {
    id: "nexa.hr.aggregates.turnover_weekly.v1",
    direction: "egress" as const,
    consumers: ["plasticity", "central_hub"] as const,
    description: "Serie settimanale score turnover aggregati per company (nessun nominativo)."
  },
  {
    id: "nexa.hr.aggregates.workforce_cockpit.v1",
    direction: "egress" as const,
    consumers: ["plasticity", "central_hub"] as const,
    description: "Headcount, massa retributiva mensile stimata e serie scenari cockpit (numeri aggregati)."
  },
  {
    id: "nexa.hr.aggregates.skills_gap_summary.v1",
    direction: "egress" as const,
    consumers: ["central_hub"] as const,
    description: "Gap medio per ruolo/competenza dopo materializzazione report skills."
  }
] as const;

export type NexaHrSuiteAggregateEventId = (typeof NEXA_HR_SUITE_AGGREGATE_EVENTS)[number]["id"];
