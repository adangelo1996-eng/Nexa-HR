import type { HebbMateAutomationProposal } from "./hebb-mate.types";

/** Come viene avviata l'automazione (schedulata vs evento HR). */
export type HebbMateAutomationTriggerType = "schedule" | "event" | "threshold";

export type HebbMateAutomationCatalogAction = {
  type: "cowork_tool" | "hr_report" | "notification" | "data_scan";
  label: string;
  toolId?: string;
  payload?: Record<string, unknown>;
};

export type HebbMateAutomationCatalogEntry = {
  catalogId: string;
  title: string;
  description: string;
  workArea: string;
  frequency: HebbMateAutomationProposal["frequency"];
  scheduleHint: string;
  triggerType: HebbMateAutomationTriggerType;
  keywords: string[];
  permissions: string[];
  estimatedImpact: string;
  toolId?: string;
  actions: HebbMateAutomationCatalogAction[];
};

/**
 * Catalogo automazioni HR generiche (company-wide).
 * Azioni allineate a moduli Nexa: timbrature, contratti, formazione, documenti, lifecycle.
 */
export const HEBB_MATE_AUTOMATION_CATALOG: HebbMateAutomationCatalogEntry[] = [
  {
    catalogId: "attendance_anomaly_daily",
    title: "Controllo anomalie timbrature (giornaliero)",
    description:
      "Ogni giorno lavorativo verifica timbrature mancanti (ingresso/uscita), doppie timbrature e ore fuori soglia sul perimetro aziendale; genera alert HR e riepilogo per il team presenze.",
    workArea: "attendance",
    frequency: "daily",
    scheduleHint: "Ogni giorno lavorativo alle 18:30",
    triggerType: "schedule",
    keywords: [
      "timbratur",
      "presenz",
      "anomal",
      "ingresso",
      "uscita",
      "clock",
      "attendance",
      "mancant"
    ],
    permissions: ["nexa.reports_hr:read", "nexa.attendance:read"],
    estimatedImpact: "Riduce controlli manuali sulle timbrature e segnala subito irregolarità",
    toolId: "evaluate_hr_alerts",
    actions: [
      {
        type: "data_scan",
        label: "Scansione board timbrature giornaliera",
        payload: { module: "attendance_day_board", check: "missing_in_out" }
      },
      {
        type: "cowork_tool",
        label: "Ricalcolo alert HR presenze",
        toolId: "evaluate_hr_alerts"
      },
      {
        type: "hr_report",
        label: "Report anomalie timbrature",
        payload: { reportKind: "attendance_payroll_anomalies" }
      }
    ]
  },
  {
    catalogId: "attendance_weekly_summary",
    title: "Report settimanale presenze e timbrature",
    description:
      "Ogni lunedì sintetizza per l'azienda ore lavorate, assenze non giustificate e pattern irregolari di timbratura della settimana precedente.",
    workArea: "attendance",
    frequency: "weekly",
    scheduleHint: "Ogni lunedì alle 09:00",
    triggerType: "schedule",
    keywords: ["timbratur", "presenz", "settiman", "report presenz", "riepilogo presenz"],
    permissions: ["nexa.reports_hr:read"],
    estimatedImpact: "Visione settimanale per HR e responsabili di centro di costo",
    toolId: "run_hr_center_recap",
    actions: [
      {
        type: "cowork_tool",
        label: "Recap HR Center presenze",
        toolId: "run_hr_center_recap",
        payload: { focus: "attendance" }
      }
    ]
  },
  {
    catalogId: "fixed_term_contract_expiry",
    title: "Alert contratti a tempo determinato in scadenza",
    description:
      "Controllo mensile dei rapporti determinati con data fine entro 60 giorni: elenco dipendenti, centro di costo e azioni suggerite (rinnovo, trasformazione, offboarding).",
    workArea: "lifecycle",
    frequency: "monthly",
    scheduleHint: "Primo giorno lavorativo del mese alle 10:00",
    triggerType: "threshold",
    keywords: [
      "determinat",
      "scadenza contratt",
      "fine rapporto",
      "termine contratt",
      "fixed term",
      "scadenza contratt"
    ],
    permissions: ["nexa.lifecycle:read", "nexa.reports_hr:read"],
    estimatedImpact: "Evita scadenze non gestite e errori su proroghe CCNL",
    toolId: "evaluate_hr_alerts",
    actions: [
      {
        type: "data_scan",
        label: "Scansione contractType e hireDate/endDate anagrafica",
        payload: { module: "users", filter: "contractType=determinato", horizonDays: 60 }
      },
      {
        type: "cowork_tool",
        label: "Valuta alert HR lifecycle",
        toolId: "evaluate_hr_alerts",
        payload: { ruleSet: "contract_expiry" }
      },
      {
        type: "notification",
        label: "Notifica HR contratti in scadenza",
        payload: { channel: "in_app", audience: "hr_lifecycle" }
      }
    ]
  },
  {
    catalogId: "training_validity_expiring",
    title: "Formazione obbligatoria in scadenza",
    description:
      "Verifica trimestrale attestati e corsi con validità in scadenza (sicurezza, privacy, antincendio): elenco assegnazioni e promemoria rinnovo.",
    workArea: "training",
    frequency: "quarterly",
    scheduleHint: "Primo giorno del trimestre alle 09:30",
    triggerType: "threshold",
    keywords: [
      "formaz",
      "training",
      "corso",
      "attestat",
      "validit",
      "scadenza formaz",
      "sicurezza",
      "obbligator"
    ],
    permissions: ["nexa.lifecycle:read"],
    estimatedImpact: "Mantiene la conformità formativa senza controlli manuali su Excel",
    toolId: "training_batch",
    actions: [
      {
        type: "data_scan",
        label: "Lista validity-alerts formazione",
        payload: { module: "training_validity_alerts", thresholdDays: 30 }
      },
      {
        type: "notification",
        label: "Promemoria rinnovo corso ai dipendenti",
        payload: { channel: "in_app", audience: "assignees" }
      },
      {
        type: "cowork_tool",
        label: "Assegnazione rinnovo corso (batch)",
        toolId: "training_batch",
        payload: { dueDateOffsetDays: 30 }
      }
    ]
  },
  {
    catalogId: "leave_balance_low",
    title: "Ferie residue basse o negative",
    description:
      "Ogni mese segnala dipendenti con saldo ferie/ROL sotto soglia o in negativo, per pianificazione ferie obbligatorie e compliance.",
    workArea: "time_off",
    frequency: "monthly",
    scheduleHint: "15° giorno del mese alle 11:00",
    triggerType: "threshold",
    keywords: ["ferie", "residu", "rol", "saldo ferie", "monte ferie", "leave balance"],
    permissions: ["nexa.leaves:read", "nexa.reports_hr:read"],
    estimatedImpact: "Supporta HR nella pianificazione ferie e nel rispetto policy aziendali",
    toolId: "evaluate_hr_alerts",
    actions: [
      {
        type: "data_scan",
        label: "Scansione saldi ferie per dipendente",
        payload: { module: "leave_allowances", thresholdDays: 5 }
      },
      {
        type: "cowork_tool",
        label: "Ricalcolo alert HR ferie",
        toolId: "evaluate_hr_alerts"
      }
    ]
  },
  {
    catalogId: "document_signature_pending",
    title: "Documenti in attesa di firma",
    description:
      "Promemoria settimanale su documenti vault (contratti, policy, cedolini) con richiesta firma ancora aperta oltre 7 giorni.",
    workArea: "documents",
    frequency: "weekly",
    scheduleHint: "Ogni mercoledì alle 10:00",
    triggerType: "event",
    keywords: [
      "firma",
      "document",
      "vault",
      "pendent",
      "signature",
      "lettura document",
      "ack"
    ],
    permissions: ["nexa.documents:read"],
    estimatedImpact: "Accelera la chiusura del ciclo documentale e riduce solleciti manuali",
    toolId: "link_document_ack",
    actions: [
      {
        type: "data_scan",
        label: "Elenco hr_document_signature_requests pending",
        payload: { module: "document_signatures", status: "pending", olderThanDays: 7 }
      },
      {
        type: "cowork_tool",
        label: "Promemoria lettura documento",
        toolId: "link_document_ack"
      }
    ]
  },
  {
    catalogId: "onboarding_checklist_stale",
    title: "Onboarding incompleto o fermo",
    description:
      "Sollecito settimanale ai dipendenti con wizard onboarding non completato da oltre 14 giorni dall'assunzione.",
    workArea: "onboarding",
    frequency: "weekly",
    scheduleHint: "Ogni venerdì alle 16:00",
    triggerType: "threshold",
    keywords: ["onboarding", "wizard", "checklist", "assunz", "incomplet", "nuovo assunto"],
    permissions: ["nexa.lifecycle:read"],
    estimatedImpact: "Migliora time-to-productivity dei nuovi assunti",
    toolId: "onboarding_wizard_reminder",
    actions: [
      {
        type: "data_scan",
        label: "Dipendenti con onboarding incompleto",
        payload: { module: "onboarding_wizard", staleDays: 14 }
      },
      {
        type: "cowork_tool",
        label: "Promemoria step onboarding",
        toolId: "onboarding_wizard_reminder"
      }
    ]
  },
  {
    catalogId: "pending_leave_approvals",
    title: "Richieste ferie in attesa di approvazione",
    description:
      "Controllo giornaliero delle richieste ferie/ROL pending oltre 3 giorni lavorativi per i responsabili HR.",
    workArea: "time_off",
    frequency: "daily",
    scheduleHint: "Ogni giorno lavorativo alle 08:30",
    triggerType: "event",
    keywords: ["ferie", "approv", "pending", "richieste in attesa", "leave approval"],
    permissions: ["nexa.approvals:write", "nexa.leaves:read"],
    estimatedImpact: "Riduce ritardi nelle approvazioni e conflitti di pianificazione",
    toolId: "approve_pending_leaves",
    actions: [
      {
        type: "data_scan",
        label: "Coda richieste ferie pending",
        payload: { module: "leave_requests", status: "pending", olderThanDays: 3 }
      },
      {
        type: "notification",
        label: "Notifica responsabili approvazione",
        payload: { channel: "in_app", audience: "approvers" }
      }
    ]
  },
  {
    catalogId: "smartworking_agreement_renewal",
    title: "Rinnovo accordi smart working annuali",
    description:
      "Avvio annuale del batch rinnovo accordi agile per dipendenti in perimetro, allineato alla policy dell'anno corrente.",
    workArea: "smartworking_agreements",
    frequency: "yearly",
    scheduleHint: "Gennaio — prima settimana lavorativa",
    triggerType: "schedule",
    keywords: ["smart working", "smartworking", "accordo agile", "rinnovo accord", "remote"],
    permissions: ["nexa.lifecycle:write"],
    estimatedImpact: "Standardizza il rinnovo massivo degli accordi agile",
    toolId: "renew_agreements",
    actions: [
      {
        type: "cowork_tool",
        label: "Rinnovo accordi smart working",
        toolId: "renew_agreements",
        payload: { policyVersion: "current_year" }
      }
    ]
  },
  {
    catalogId: "payroll_payslip_publish",
    title: "Pubblicazione cedolini mensile",
    description:
      "Al termine del ciclo paghe, pubblica i cedolini del periodo YYYY-MM per tutti i dipendenti con bozza già generata.",
    workArea: "payroll",
    frequency: "monthly",
    scheduleHint: "Ultimo giorno lavorativo del mese — dopo chiusura paghe",
    triggerType: "schedule",
    keywords: ["cedolin", "payslip", "paghe", "payroll", "stipend"],
    permissions: ["nexa.payroll:write"],
    estimatedImpact: "Automatizza la pubblicazione ricorrente post-chiusura paghe",
    toolId: "publish_payslips_period",
    actions: [
      {
        type: "cowork_tool",
        label: "Pubblica cedolini periodo",
        toolId: "publish_payslips_period",
        payload: { period: "previous_month" }
      }
    ]
  },
  {
    catalogId: "expense_approval_reminder",
    title: "Note spese in attesa di approvazione",
    description:
      "Sollecito settimanale su note spese in stato pending oltre 5 giorni per gli approvatori del perimetro.",
    workArea: "generic",
    frequency: "weekly",
    scheduleHint: "Ogni martedì alle 11:00",
    triggerType: "event",
    keywords: ["spese", "expense", "nota spese", "rimborso", "approv spese"],
    permissions: ["nexa.approvals:write", "nexa.expenses:read"],
    estimatedImpact: "Accelera i rimborsi e riduce backlog approvazioni",
    toolId: "approve_pending_expenses",
    actions: [
      {
        type: "data_scan",
        label: "Coda expense pending",
        payload: { module: "expenses", status: "pending", olderThanDays: 5 }
      },
      {
        type: "notification",
        label: "Notifica approvatori spese",
        payload: { channel: "in_app", audience: "approvers" }
      }
    ]
  },
  {
    catalogId: "hr_alerts_monthly_refresh",
    title: "Ricalcolo alert HR aziendali",
    description:
      "Rigenera mensilmente gli alert HR (turnover, hotspot, anomalie) per dashboard e HR Center.",
    workArea: "analytics",
    frequency: "monthly",
    scheduleHint: "Primo giorno lavorativo del mese alle 07:00",
    triggerType: "schedule",
    keywords: ["alert hr", "analytics", "dashboard hr", "turnover", "hotspot"],
    permissions: ["nexa.reports_hr:read"],
    estimatedImpact: "Mantiene aggiornati gli indicatori di rischio people",
    toolId: "evaluate_hr_alerts",
    actions: [
      { type: "cowork_tool", label: "Valuta alert HR", toolId: "evaluate_hr_alerts" },
      { type: "cowork_tool", label: "Ricalcolo retention", toolId: "run_retention_analysis" }
    ]
  }
];

/** Bundle predefinito per richieste generiche «automazioni mensili HR». */
export const HEBB_MATE_DEFAULT_MONTHLY_HR_CATALOG_IDS = [
  "attendance_anomaly_daily",
  "fixed_term_contract_expiry",
  "training_validity_expiring",
  "leave_balance_low",
  "document_signature_pending",
  "onboarding_checklist_stale",
  "hr_alerts_monthly_refresh"
] as const;

const FREQUENCY_HINT_PATTERNS: Array<{
  frequency: HebbMateAutomationProposal["frequency"];
  patterns: RegExp[];
}> = [
  { frequency: "daily", patterns: [/\bgiornal/i, /\bogni\s+giorno/i, /\bdaily\b/i] },
  { frequency: "weekly", patterns: [/\bsettiman/i, /\bweekly\b/i, /\bluned/i] },
  { frequency: "monthly", patterns: [/\bmensil/i, /\bmonthly\b/i, /\bogni\s+mese/i] },
  { frequency: "quarterly", patterns: [/\btrimestr/i, /\bquarterly\b/i] },
  { frequency: "yearly", patterns: [/\bannual/i, /\bogni\s+anno/i, /\byearly\b/i] }
];

export function inferAutomationFrequencyHint(message: string): HebbMateAutomationProposal["frequency"] | undefined {
  const text = message.toLowerCase();
  for (const row of FREQUENCY_HINT_PATTERNS) {
    if (row.patterns.some((re) => re.test(text))) return row.frequency;
  }
  return undefined;
}

function scoreCatalogEntry(entry: HebbMateAutomationCatalogEntry, text: string, workArea?: string): number {
  let score = 0;
  for (const kw of entry.keywords) {
    if (kw.includes(".*")) {
      if (new RegExp(kw, "i").test(text)) score += 3;
    } else if (text.includes(kw.toLowerCase())) {
      score += 2;
    }
  }
  if (workArea?.trim()) {
    const area = workArea.toLowerCase();
    if (entry.workArea === area || entry.workArea.includes(area) || area.includes(entry.workArea)) {
      score += 4;
    }
  }
  return score;
}

export function getAutomationCatalogById(catalogId: string): HebbMateAutomationCatalogEntry | undefined {
  return HEBB_MATE_AUTOMATION_CATALOG.find((e) => e.catalogId === catalogId);
}

export function catalogEntryToProposal(
  entry: HebbMateAutomationCatalogEntry,
  impactOverride?: string
): HebbMateAutomationProposal {
  return {
    id: `catalog-${entry.catalogId}`,
    catalogId: entry.catalogId,
    title: entry.title,
    description: entry.description,
    workArea: entry.workArea,
    frequency: entry.frequency,
    scheduleHint: entry.scheduleHint,
    triggerType: entry.triggerType,
    toolId: entry.toolId,
    permissions: entry.permissions,
    estimatedImpact: impactOverride ?? entry.estimatedImpact,
    actions: entry.actions.map((a) => ({
      type: a.type,
      label: a.label,
      toolId: a.toolId,
      payload: a.payload
    }))
  };
}

/**
 * Seleziona proposte dal catalogo in base al messaggio utente.
 * Per richieste generiche mensili HR restituisce il bundle predefinito.
 */
export function selectAutomationProposalsFromCatalog(input: {
  message?: string;
  workArea?: string;
  limit?: number;
}): HebbMateAutomationProposal[] {
  const text = (input.message ?? "").trim().toLowerCase();
  const limit = input.limit ?? 8;
  const frequencyFilter = text ? inferAutomationFrequencyHint(text) : undefined;

  const scored = HEBB_MATE_AUTOMATION_CATALOG.map((entry) => ({
    entry,
    score: scoreCatalogEntry(entry, text, input.workArea)
  }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  let picked: HebbMateAutomationCatalogEntry[];
  let usedDefaultBundle = false;

  if (scored.length > 0) {
    picked = scored.map((r) => r.entry);
  } else if (
    /\bautomaz/i.test(text) ||
    /\bautomat\b/i.test(text) ||
    /\bsuggerisc/i.test(text) ||
    /\bschedul/i.test(text) ||
    /\bpianifica/i.test(text) ||
    /\btask\s+ricorrent/i.test(text) ||
    /\bmensil.*\bhr\b/i.test(text) ||
    /\bhr\b.*\bmensil/i.test(text)
  ) {
    picked = HEBB_MATE_DEFAULT_MONTHLY_HR_CATALOG_IDS.map((id) => getAutomationCatalogById(id)).filter(
      (e): e is HebbMateAutomationCatalogEntry => Boolean(e)
    );
    usedDefaultBundle = true;
  } else {
    return [];
  }

  if (frequencyFilter && !usedDefaultBundle) {
    const freqMatched = picked.filter((e) => e.frequency === frequencyFilter);
    if (freqMatched.length >= 2) {
      picked = freqMatched;
    }
  }

  return picked.slice(0, limit).map((entry) => catalogEntryToProposal(entry));
}

/** Prompt rapidi per UI (esempi chip). */
export function getAutomationQuickExamplePrompts(): string[] {
  return [
    "Suggerisci automazioni mensili per HR",
    "Controllo giornaliero anomalie timbrature",
    "Alert contratti determinati in scadenza",
    "Formazione obbligatoria in scadenza",
    "Documenti in attesa di firma",
    "Onboarding incompleto da più di 14 giorni"
  ];
}
