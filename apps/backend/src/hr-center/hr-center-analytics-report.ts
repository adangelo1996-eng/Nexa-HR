/**
 * Report analisi Centro HR (forma envelope attesa dopo depseudonymize).
 * Costruzione locale quando il LLM non è disponibile o fallisce il refine.
 */

export type HrCenterFactsByCc = {
  costCenterId: string;
  headcount: number;
  monthlyGrossSum: number;
};

export type HrCenterAnalyticsFacts = {
  scope: string;
  byCostCenter: HrCenterFactsByCc[];
  totals: { headcount: number; monthlyGrossSum: number; avgWeeklyContractHours: number };
  disclaimer: string;
};

export type HrCenterAnalyticsReportEnvelope = {
  executiveSummary: string;
  strategicInsights: string[];
  costCenterNarratives: Array<{
    costCenterId: string;
    headline: string;
    analysis: string;
    suggestion: string;
  }>;
  priorities: Array<{ title: string; rationale: string; nextStep: string }>;
  expertClosingNote: string;
  methodologyNote: string;
};

export function buildOfflineHrCenterAnalyticsReport(facts: HrCenterAnalyticsFacts): {
  envelope: HrCenterAnalyticsReportEnvelope;
} {
  const { totals, byCostCenter, scope, disclaimer } = facts;
  const sorted = [...byCostCenter].sort((a, b) => b.monthlyGrossSum - a.monthlyGrossSum);
  const top = sorted[0];
  const shareTop =
    totals.monthlyGrossSum > 0 && top
      ? Math.round((top.monthlyGrossSum / totals.monthlyGrossSum) * 1000) / 10
      : 0;

  const executiveSummary =
    `Vista ${scope === "team" ? "a perimetro team / riporti" : "aziendale"}: ${totals.headcount} persone in anagrafica, ` +
    `competenze mensili complessive indicative €${totals.monthlyGrossSum.toLocaleString("it-IT")}, ` +
    `media ore contrattuali settimanali ${totals.avgWeeklyContractHours}. ` +
    (top
      ? `Il centro di costo con maggior peso economico è «${top.costCenterId}» (~${shareTop}% della massa salariale mensile indicata).`
      : "Non risultano centri di costo valorizzati per la ripartizione.");

  const strategicInsights: string[] = [
    "Verificare coerenza tra RAL / mensilità e ore contrattuali: le incongruenze distorcono i costi orari impliciti e le proiezioni di budget.",
    "Incrociare i centri di costo più pesanti con assenze, turnover e assunzioni in corso per anticipare tensioni di organico.",
    "Usare questa analisi come fotogramma operativo: per decisioni legali o contrattuali fare sempre riferimento a HR e al consulente del lavoro."
  ];

  const costCenterNarratives = sorted.slice(0, 12).map((row) => {
    const perCapita =
      row.headcount > 0 ? Math.round((row.monthlyGrossSum / row.headcount) * 100) / 100 : 0;
    return {
      costCenterId: row.costCenterId,
      headline: `${row.headcount} FTE · €${row.monthlyGrossSum.toLocaleString("it-IT")}/mese indicativi`,
      analysis: `Competenza media pro-capite indicativa €${perCapita.toLocaleString("it-IT")}/mese. Utile per confronti interni e benchmark di ruolo, non come retribuzione individuale.`,
      suggestion:
        row.headcount >= 8 && perCapita > 0
          ? "Valutare colloqui con il responsabile di centro su carichi di lavoro e rischi di retention."
          : "Monitorare evoluzione headcount e progetti che possono spostare il mix costi."
    };
  });

  const priorities = [
    {
      title: "Consolidare i dati anagrafici",
      rationale: "Aggregati sensibili a errori di centro di costo o RAL non allineata.",
      nextStep: "Eseguire controllo campione sui dipendenti del top 2 centri di costo per codice e importi."
    },
    {
      title: "Collegare a budget e turnover",
      rationale: "Il costo del personale va letto insieme a assunzioni, uscite e obiettivi di business.",
      nextStep: "Aprire Workforce planning e Turnover e retention con lo stesso perimetro aziendale."
    }
  ];

  return {
    envelope: {
      executiveSummary,
      strategicInsights,
      costCenterNarratives,
      priorities,
      expertClosingNote:
        "Sintesi generata in modalità offline: stesso schema qualitativo del percorso con LLM, " +
        "con linguaggio da consulente HR interno. Attivare il modello linguistico per approfondimenti contestualizzati sui vostri numeri.",
      methodologyNote: disclaimer
    }
  };
}
