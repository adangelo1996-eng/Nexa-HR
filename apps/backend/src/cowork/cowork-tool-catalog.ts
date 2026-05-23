import type { CoworkAreaId, CoworkToolDef } from "./cowork.types";

/** Catalogo operazioni Cowork — unica fonte per planner, hydration ed executor. */
export const COWORK_TOOL_LIST: CoworkToolDef[] = [
  // —— Smart working (legacy domini) ——
  {
    id: "renew_agreements",
    areaId: "smartworking_agreements",
    domain: "smartworking_agreements",
    labelIt: "Rinnovo accordi smart working annuali",
    hintIt: "create_agreement / renew_agreement per dipendente nel perimetro",
    executable: true,
    permissions: ["nexa.lifecycle:write"],
    paramSchema: {
      validFrom: { type: "date", required: true, descriptionIt: "Inizio validità (YYYY-MM-DD)" },
      validTo: { type: "date", required: true, descriptionIt: "Fine validità" },
      policyVersion: { type: "string", descriptionIt: "Anno policy (es. 2026)" }
    }
  },
  {
    id: "extend_approved_requests",
    areaId: "smartworking_requests",
    domain: "smartworking_requests",
    labelIt: "Estensione richieste smart working approvate",
    hintIt: "extend_request su richieste approved con endDay prima della data target",
    executable: true,
    permissions: ["nexa.lifecycle:write"],
    paramSchema: {
      newEndDay: { type: "date", required: true, descriptionIt: "Nuova data fine periodo" }
    }
  },
  {
    id: "update_contract_sw_clause",
    areaId: "employment_contracts",
    domain: "employment_contracts",
    labelIt: "Contratti standard con clausola smart working",
    hintIt: "update_contract_sw_clause o create_contract_draft",
    executable: true,
    permissions: ["nexa.standard_contracts:write", "nexa.lifecycle:write"],
    paramSchema: {
      policyYear: { type: "number", descriptionIt: "Anno rinnovo clausola agile" }
    }
  },
  // —— Calendario ——
  {
    id: "create_meeting_room_booking",
    areaId: "calendar",
    domain: "calendar",
    labelIt: "Prenotazione sala (evento calendario)",
    hintIt: "Inserisce prenotazione sala riunioni visibile sul calendario team",
    executable: true,
    permissions: ["nexa.work_calendar:read"],
    paramSchema: {
      roomId: { type: "string", descriptionIt: "ID sala (default: prima sala aziendale)" },
      startsAt: { type: "datetime", required: true },
      endsAt: { type: "datetime", required: true },
      title: { type: "string", descriptionIt: "Titolo evento" }
    }
  },
  {
    id: "cancel_meeting_room_booking",
    areaId: "calendar",
    domain: "calendar",
    labelIt: "Annulla prenotazione sala",
    hintIt: "Annulla booking esistente per ID prenotazione",
    executable: true,
    permissions: ["nexa.work_calendar:read"],
    paramSchema: {
      bookingId: { type: "string", required: true }
    }
  },
  {
    id: "sync_team_calendar_view",
    areaId: "calendar",
    domain: "calendar",
    labelIt: "Export vista calendario team",
    hintIt: "Riepilogo JSON eventi calendario per dipendenti nel perimetro (lettura)",
    executable: true,
    permissions: ["nexa.work_calendar:read"],
    paramSchema: {
      from: { type: "date", descriptionIt: "Inizio intervallo (YYYY-MM-DD)" },
      to: { type: "date", descriptionIt: "Fine intervallo (YYYY-MM-DD)" }
    }
  },
  // —— Time off / assenze ——
  {
    id: "create_leave_plan",
    areaId: "time_off",
    domain: "time_off",
    labelIt: "Richiesta ferie / ROL (per dipendente)",
    hintIt: "Crea piano ferie in attesa per ogni dipendente nel perimetro",
    executable: true,
    permissions: ["nexa.leaves:write"],
    paramSchema: {
      startDate: { type: "date", required: true },
      endDate: { type: "date", required: true },
      kind: { type: "string", descriptionIt: "annual | rol" }
    }
  },
  {
    id: "create_smartworking_request",
    areaId: "time_off",
    domain: "time_off",
    labelIt: "Richiesta remote working",
    hintIt: "Crea richiesta SW in attesa per periodo indicato",
    executable: true,
    permissions: ["nexa.attendance:write"],
    paramSchema: {
      day: { type: "date", required: true },
      endDay: { type: "date" },
      note: { type: "string" }
    }
  },
  {
    id: "create_travel_request",
    areaId: "time_off",
    domain: "time_off",
    labelIt: "Richiesta trasferta",
    hintIt: "Registra giornata trasferta in attesa",
    executable: true,
    permissions: ["nexa.attendance:write"],
    paramSchema: {
      day: { type: "date", required: true },
      note: { type: "string" }
    }
  },
  {
    id: "create_sickness_report",
    areaId: "time_off",
    domain: "time_off",
    labelIt: "Comunicazione malattia",
    hintIt: "Apre evento malattia in attesa per intervallo date",
    executable: true,
    permissions: ["nexa.sickness:write"],
    paramSchema: {
      fromDate: { type: "date", required: true },
      toDate: { type: "date", required: true }
    }
  },
  {
    id: "approve_pending_leaves",
    areaId: "time_off",
    domain: "time_off",
    labelIt: "Approva ferie in attesa (perimetro)",
    hintIt: "Approva richieste leave pending dei dipendenti nel perimetro",
    executable: true,
    permissions: ["nexa.approvals:write", "nexa.leaves:read"]
  },
  {
    id: "approve_pending_smartworking",
    areaId: "time_off",
    domain: "time_off",
    labelIt: "Approva remote working in attesa",
    hintIt: "Approva richieste SW pending nel perimetro",
    executable: true,
    permissions: ["nexa.approvals:write"]
  },
  // —— Turni (visibili in calendario) ——
  {
    id: "create_shift_batch",
    areaId: "calendar",
    domain: "calendar",
    labelIt: "Assegna turno (batch perimetro)",
    hintIt: "Crea turno con stesso orario per dipendenti nel perimetro",
    executable: true,
    permissions: ["nexa.shifts:write"],
    paramSchema: {
      startAt: { type: "datetime", required: true },
      endAt: { type: "datetime", required: true },
      premiumCode: { type: "string" }
    }
  },
  // —— Formazione ——
  {
    id: "training_batch",
    areaId: "training",
    domain: "training",
    labelIt: "Assegnazione formazione batch",
    hintIt: "Assegna uno o più corsi (per titolo/codice/UUID) a dipendenti nel perimetro",
    executable: true,
    permissions: ["nexa.lifecycle:write"],
    paramSchema: {
      courseIds: { type: "string", descriptionIt: "ID corsi (UUID) o risolti da titolo/codice nel messaggio" },
      dueDate: { type: "date", descriptionIt: "Scadenza completamento (YYYY-MM-DD)" }
    }
  },
  {
    id: "assign_training_course",
    areaId: "training",
    domain: "training",
    labelIt: "Iscrizione corso singolo",
    hintIt: "Un corso per dipendente nel perimetro — courseId da messaggio o planner",
    executable: true,
    permissions: ["nexa.lifecycle:write"],
    paramSchema: {
      courseId: { type: "string", required: true, descriptionIt: "ID corso (UUID) o risolto da titolo/codice" },
      dueDate: { type: "date", descriptionIt: "Scadenza completamento" }
    }
  },
  // —— Documenti ——
  {
    id: "upload_employee_document",
    areaId: "documents",
    domain: "documents",
    labelIt: "Registra documento dipendente (metadati)",
    hintIt: "Crea scheda documento nel vault; allega il file da Documenti se serve il contenuto",
    executable: true,
    permissions: ["nexa.documents:write"],
    paramSchema: {
      title: { type: "string", required: true, descriptionIt: "Titolo documento" },
      kind: { type: "string", descriptionIt: "contract | payslip | personal | other" }
    }
  },
  {
    id: "link_document_ack",
    areaId: "documents",
    domain: "documents",
    labelIt: "Promemoria lettura documento",
    hintIt: "Notifica in-app per documento vault (ID nel messaggio o ultimo caricato)",
    executable: true,
    permissions: ["nexa.documents:read"],
    paramSchema: {
      documentId: { type: "string", descriptionIt: "UUID documento employee_documents" }
    }
  },
  // —— Organizzazione ——
  {
    id: "update_leave_allowance",
    areaId: "org",
    domain: "org",
    labelIt: "Aggiorna monte ferie annuale",
    hintIt: "Imposta allocatedDays per anno su dipendenti nel perimetro",
    executable: true,
    permissions: ["nexa.leaves:write"],
    paramSchema: {
      year: { type: "number", required: true },
      allocatedDays: { type: "number", required: true }
    }
  },
  {
    id: "export_employees_preview",
    areaId: "admin",
    domain: "admin",
    labelIt: "Anteprima export anagrafica",
    hintIt: "Genera anteprima colonne/righe export dipendenti nel perimetro (senza file)",
    executable: true,
    permissions: ["nexa.admin_users:read"]
  },
  // —— Payroll ——
  {
    id: "publish_payslips_period",
    areaId: "payroll",
    domain: "payroll",
    labelIt: "Pubblica cedolini periodo",
    hintIt: "Pubblica tutti i cedolini generati per YYYY-MM",
    executable: true,
    highRisk: true,
    permissions: ["nexa.payroll:write"],
    paramSchema: {
      period: { type: "string", required: true, descriptionIt: "Periodo YYYY-MM" }
    }
  },
  {
    id: "payroll_batch_generate",
    areaId: "payroll",
    domain: "payroll",
    labelIt: "Genera cedolini batch",
    hintIt: "Generazione bozze cedolini per periodo YYYY-MM su dipendenti nel perimetro",
    executable: true,
    highRisk: true,
    permissions: ["nexa.payroll:write"],
    paramSchema: {
      period: { type: "string", required: true, descriptionIt: "Periodo YYYY-MM" },
      usePreviousMonthVariables: { type: "boolean", descriptionIt: "Usa variabili mese precedente" }
    }
  },
  {
    id: "compensation_benchmark_estimate",
    areaId: "payroll",
    domain: "payroll",
    labelIt: "Benchmark RAL (stima)",
    hintIt: "Stima fascia RAL per ruolo organico del dipendente nel perimetro",
    executable: true,
    permissions: ["nexa.payroll:read"],
    paramSchema: {
      location: { type: "string", descriptionIt: "Area geografica (default: Italia)" },
      seniorityYears: { type: "number", descriptionIt: "Anni anzianità (default da anzianità)" }
    }
  },
  // —— Onboarding / lifecycle ——
  {
    id: "start_offboarding",
    areaId: "lifecycle",
    domain: "lifecycle",
    labelIt: "Avvia offboarding",
    hintIt: "Apre wizard uscita per dipendenti nel perimetro",
    executable: true,
    permissions: ["nexa.lifecycle:write"]
  },
  {
    id: "start_onboarding_from_candidate",
    areaId: "onboarding",
    domain: "onboarding",
    labelIt: "Onboarding da candidato",
    hintIt: "Avvia wizard HR da candidato recruiting (UUID candidato nel messaggio)",
    executable: true,
    permissions: ["nexa.lifecycle:write"],
    paramSchema: {
      candidateId: { type: "string", required: true, descriptionIt: "UUID candidato in Selezione" }
    }
  },
  {
    id: "onboarding_wizard_reminder",
    areaId: "onboarding",
    domain: "onboarding",
    labelIt: "Promemoria step onboarding",
    hintIt: "Notifica dipendenti con wizard onboarding incompleto nel perimetro",
    executable: true,
    permissions: ["nexa.lifecycle:read"]
  },
  // —— Analytics ——
  {
    id: "run_hr_center_recap",
    areaId: "analytics",
    domain: "analytics",
    labelIt: "Report HR Center recap",
    hintIt: "Recap narrativo AI su dipendenti nel perimetro",
    executable: true,
    permissions: ["nexa.reports_hr:read"]
  },
  {
    id: "run_retention_analysis",
    areaId: "analytics",
    domain: "analytics",
    labelIt: "Ricalcolo score retention / turnover",
    hintIt: "Rigenera gli score turnover per l'azienda (job batch)",
    executable: true,
    permissions: ["nexa.reports_hr:read"]
  },
  {
    id: "evaluate_hr_alerts",
    areaId: "analytics",
    domain: "analytics",
    labelIt: "Valuta alert HR",
    hintIt: "Ricalcolo regole alert HR per l'azienda",
    executable: true,
    permissions: ["nexa.reports_hr:read"]
  },
  // —— Generic / innovation / spese ——
  {
    id: "create_expense_claim",
    areaId: "generic",
    domain: "generic",
    labelIt: "Bozza nota spese",
    hintIt: "Crea claim in bozza per dipendente (importo da messaggio se presente)",
    executable: true,
    permissions: ["nexa.expenses:write"],
    paramSchema: {
      amountEur: { type: "number" },
      description: { type: "string" }
    }
  },
  {
    id: "approve_pending_expenses",
    areaId: "generic",
    domain: "generic",
    labelIt: "Approva note spese in attesa",
    hintIt: "Approva expense pending nel perimetro",
    executable: true,
    permissions: ["nexa.approvals:write", "nexa.expenses:read"]
  },
  {
    id: "create_innovation_job",
    areaId: "generic",
    domain: "generic",
    labelIt: "Job Innovation (AI/ATS)",
    hintIt: "Avvia pipeline innovation con titolo da messaggio",
    executable: true,
    permissions: ["nexa.innovation:write"],
    paramSchema: {
      title: { type: "string", required: true }
    }
  },
  {
    id: "hr_recap_reminder",
    areaId: "generic",
    domain: "generic",
    labelIt: "Promemoria HR recap",
    hintIt: "Sollecito su task HR Recap (approvazioni, spese, contratti)",
    executable: true,
    permissions: ["nexa.lifecycle:write"],
    paramSchema: {
      taskId: { type: "string", descriptionIt: "ID task (es. appr:uuid) — opzionale se in coda" }
    }
  },
  {
    id: "personnel_budget_adjust",
    areaId: "personnel_budget",
    domain: "personnel_budget",
    labelIt: "Modifica budget personale",
    hintIt: "Imposta budget RAL mensile per dipendenti nel perimetro",
    executable: true,
    permissions: ["nexa.personnel_budget:write"],
    paramSchema: {
      year: { type: "number", descriptionIt: "Anno (default: corrente)" },
      month: { type: "number", descriptionIt: "Mese 1-12 (default: corrente)" },
      budgetRalEur: { type: "number", descriptionIt: "Budget RAL mensile EUR (da messaggio o RAL attuale)" }
    }
  },
  {
    id: "recruiting_linkedin_sync",
    areaId: "recruiting",
    domain: "recruiting",
    labelIt: "Sync LinkedIn recruiting",
    hintIt: "Pubblica su LinkedIn le posizioni aperte non ancora sincronizzate",
    executable: true,
    permissions: ["nexa.recruiting:write"],
    paramSchema: {
      positionId: { type: "string", descriptionIt: "ID posizione (opzionale: tutte le open non linkate)" }
    }
  },
  {
    id: "corporate_policy_publish",
    areaId: "corporate_policies",
    domain: "corporate_policies",
    labelIt: "Comunica policy aziendale",
    hintIt: "Notifica dipendenti su policy già caricata (ID nel messaggio o ultima policy)",
    executable: true,
    permissions: ["nexa.corporate_policies:read"],
    paramSchema: {
      policyId: { type: "string", descriptionIt: "UUID policy corporate_policy_documents" }
    }
  },
  {
    id: "third_party_license_assign",
    areaId: "third_party_licenses",
    domain: "third_party_licenses",
    labelIt: "Assegna licenza software",
    hintIt: "Assegna licenza catalogo a dipendenti nel perimetro (UUID licenza nel messaggio)",
    executable: true,
    permissions: ["nexa.third_party_licenses:write"],
    paramSchema: {
      licenseId: { type: "string", required: true, descriptionIt: "UUID licenza third_party_licenses" }
    }
  },
  {
    id: "attendance_qr_batch",
    areaId: "generic",
    domain: "generic",
    labelIt: "Timbrature batch (perimetro HR)",
    hintIt: "Timbrature manuali multiple via POST /attendance/team/entries/bulk",
    executable: true,
    permissions: ["nexa.attendance:write"],
    paramSchema: {
      day: { type: "date", required: true, descriptionIt: "Giorno timbratura (YYYY-MM-DD)" },
      entryType: { type: "string", descriptionIt: "clock_in | clock_out (default clock_in)" }
    }
  }
];

export const COWORK_TOOL_CATALOG: Record<string, CoworkToolDef> = Object.fromEntries(
  COWORK_TOOL_LIST.map((t) => [t.id, t])
);

export const COWORK_AREA_LABELS: Record<CoworkAreaId, string> = {
  calendar: "Calendario e sale",
  time_off: "Assenze e permessi",
  lifecycle: "Lifecycle HR",
  training: "Formazione",
  documents: "Documenti",
  org: "Organizzazione",
  compensation: "Compensation",
  payroll: "Payroll e cedolini",
  personnel_budget: "Budget personale",
  recruiting: "Recruiting",
  corporate_policies: "Policy aziendali",
  third_party_licenses: "Licenze software",
  admin: "Admin import/export",
  onboarding: "Onboarding",
  analytics: "Analytics e report",
  generic: "Operazioni generiche",
  smartworking_agreements: "Accordi smart working",
  smartworking_requests: "Richieste smart working",
  employment_contracts: "Contratti di lavoro"
};

/** Tool ad alto impatto: preview HITL con rationale esplicito. */
export const COWORK_HIGH_RISK_TOOL_IDS = new Set(
  COWORK_TOOL_LIST.filter((t) => t.highRisk === true).map((t) => t.id)
);

export const COWORK_DOMAIN_LABELS: Record<string, string> = {
  ...COWORK_AREA_LABELS,
  unknown: "Da chiarire"
};

/** Tool eseguibili con hydration + apply. */
export const COWORK_EXECUTABLE_TOOL_IDS = new Set(
  COWORK_TOOL_LIST.filter((t) => t.executable).map((t) => t.id)
);

/** Domini legacy ancora serviti da executor dedicati (oltre al generic). */
export const COWORK_LEGACY_DOMAIN_EXECUTOR_DOMAINS = new Set([
  "smartworking_agreements",
  "smartworking_requests",
  "employment_contracts"
]);

export function getCoworkTool(toolId: string): CoworkToolDef | undefined {
  return COWORK_TOOL_CATALOG[toolId];
}

export function defaultToolForArea(areaId: CoworkAreaId): string | null {
  const first = COWORK_TOOL_LIST.find((t) => t.areaId === areaId && t.executable);
  return first?.id ?? COWORK_TOOL_LIST.find((t) => t.areaId === areaId)?.id ?? null;
}
