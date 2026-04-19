/**
 * Report analisi Centro HR (forma envelope attesa dopo depseudonymize).
 * Costruzione locale quando il LLM non è disponibile o fallisce il refine.
 */

export type HrCenterFactsByCc = {
  costCenterId: string;
  /** Etichetta leggibile (codice + nome) quando disponibile in anagrafica. */
  costCenterName?: string;
  headcount: number;
  monthlyGrossSum: number;
};

export type HrCenterAnalyticsFacts = {
  /** Permesso vista (azienda vs team/responsabili). */
  scope: string;
  /** Filtro analisi richiesto dal client. */
  analysisFocus: "company" | "cost_center" | "team" | "employee";
  /** Etichetta senza nominativi (es. «Centro di costo: …»). */
  analysisLabel: string;
  /** Approfondimento tematico per il modello (opzionale). */
  analysisDeepDive?: "master_data" | "budget_turnover";
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
  const { totals, byCostCenter, scope, disclaimer, analysisFocus, analysisLabel, analysisDeepDive } = facts;
  const sorted = [...byCostCenter].sort((a, b) => b.monthlyGrossSum - a.monthlyGrossSum);
  const top = sorted[0];
  const shareTop =
    totals.monthlyGrossSum > 0 && top
      ? Math.round((top.monthlyGrossSum / totals.monthlyGrossSum) * 1000) / 10
      : 0;

  const topLabel = top ? top.costCenterName?.trim() || top.costCenterId : "";

  const perimeterLine =
    analysisFocus !== "company"
      ? `${analysisLabel}. Contesto permessi: ${scope === "team" ? "perimetro team / riporti" : "vista aziendale"}. `
      : `Vista ${scope === "team" ? "a perimetro team / riporti" : "aziendale"}. `;

  const executiveSummary =
    perimeterLine +
    `${totals.headcount} persone nel campione, competenze mensili indicative €${totals.monthlyGrossSum.toLocaleString("it-IT")}, ` +
    `media ore contrattuali settimanali ${totals.avgWeeklyContractHours}. ` +
    (top && topLabel
      ? `Il centro di costo con maggior peso economico è «${topLabel}» (~${shareTop}% della massa salariale mensile indicata).`
      : "Non risultano centri di costo valorizzati per la ripartizione.");

  const strategicInsights: string[] = [
    "Verificare coerenza tra RAL / mensilità e ore contrattuali: le incongruenze distorcono i costi orari impliciti e le proiezioni di budget.",
    "Incrociare i centri di costo più pesanti con assenze, turnover e assunzioni in corso per anticipare tensioni di organico.",
    "Usare questa analisi come fotogramma operativo: per decisioni legali o contrattuali fare sempre riferimento a HR e al consulente del lavoro."
  ];

  if (analysisDeepDive === "master_data") {
    strategicInsights.unshift(
      "Approfondimento qualità dati: concentrare verifiche campione su codice centro di costo, accoppiamento team–CDC e coerenza importi mensili vs contratto."
    );
  } else if (analysisDeepDive === "budget_turnover") {
    strategicInsights.unshift(
      "Approfondimento budget/organico: esplicitare nel piano HR come le variazioni di testa e le uscite/entrate impattano il costo del personale sullo stesso perimetro (senza assumere conteggi assenti dai dati)."
    );
  }

  const costCenterNarratives = sorted.slice(0, 12).map((row) => {
    const perCapita =
      row.headcount > 0 ? Math.round((row.monthlyGrossSum / row.headcount) * 100) / 100 : 0;
    const ccDisp = row.costCenterName?.trim() || row.costCenterId;
    return {
      costCenterId: row.costCenterId,
      headline: `«${ccDisp}» · ${row.headcount} FTE · €${row.monthlyGrossSum.toLocaleString("it-IT")}/mese indicativi`,
      analysis: `Competenza media pro-capite indicativa €${perCapita.toLocaleString("it-IT")}/mese. Utile per confronti interni e benchmark di ruolo, non come retribuzione individuale.`,
      suggestion:
        row.headcount >= 8 && perCapita > 0
          ? "Valutare colloqui con il responsabile di centro su carichi di lavoro e rischi di retention."
          : "Monitorare evoluzione headcount e progetti che possono spostare il mix costi."
    };
  });

  const topTwo = sorted.slice(0, 2);
  const topTwoLabel = topTwo
    .map((r) => r.costCenterName?.trim() || r.costCenterId)
    .filter(Boolean)
    .join(" e ");

  const defaultPriorities = [
    {
      title: "Consolidare i dati anagrafici",
      rationale: "Aggregati sensibili a errori di centro di costo o RAL non allineata.",
      nextStep: topTwoLabel
        ? `Eseguire controllo campione sui dipendenti dei centri «${topTwoLabel}» (codice CDC, team, importo mensile indicativo).`
        : "Eseguire controllo campione sui dipendenti dei centri di costo a maggior massa salariale (codice CDC, team, importo mensile indicativo)."
    },
    {
      title: "Collegare a budget e turnover",
      rationale: "Il costo del personale va letto insieme a assunzioni, uscite e obiettivi di business.",
      nextStep:
        analysisFocus === "company"
          ? "Aprire Workforce planning e Turnover e retention con lo stesso perimetro aziendale."
          : `Aprire Workforce planning e Turnover e retention filtrando come per questa analisi (${analysisLabel}).`
    }
  ];

  const priorities =
    analysisDeepDive === "master_data"
      ? [
          {
            title: "Controllo campione anagrafica / CDC",
            rationale:
              "Errori su centro di costo o RAL distorcono costi per reparto e simulazioni di budget: priorità sui cluster a maggior spend.",
            nextStep: topTwoLabel
              ? `Estrarre lista nominativi (HR riservata) per «${topTwoLabel}» e verificare 10–15 posizioni: CDC, team, mensilità, ore settimanali.`
              : "Estrarre un campione dai due CDC con competenze mensili più alte e verificare CDC, team, mensilità, ore settimanali."
          },
          {
            title: "Allineamento codici e organigramma",
            rationale: "Disallineamenti tra organigramma operativo e codice contabile generano errori di allocazione.",
            nextStep: "Workshop 30' con controlling: mapping CDC ↔ team e regole di default per nuove assunzioni."
          },
          ...defaultPriorities.slice(1)
        ]
      : analysisDeepDive === "budget_turnover"
        ? [
            {
              title: "Legare costo personale a piano organico",
              rationale: "Senza collegamento a entrate/uscite e obiettivi, il budget resta una fotografia contabile.",
              nextStep:
                "Aprire Workforce planning con lo stesso perimetro e annotare 3 leve: hiring freeze, sostituzioni, upskilling interno."
            },
            {
              title: "Turnover e retention sullo stesso perimetro",
              rationale: "Il rischio di concentrazione del costo richiede lettura qualitativa delle uscite recenti.",
              nextStep:
                "Aprire Turnover e retention con filtri coerenti; definire 2 KPI di follow-up (es. uscite volontarie per CDC, time-to-hire)."
            },
            ...defaultPriorities.slice(0, 1)
          ]
        : defaultPriorities;

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
