export const HR_ONBOARDING_WIZARD_STEPS = [
  {
    key: "anagrafica_contratto",
    titleIt: "Anagrafica e contratto",
    descriptionIt: "Dati personali, rapporto di lavoro e retribuzione iniziale."
  },
  {
    key: "documenti",
    titleIt: "Documenti",
    descriptionIt: "Carica documenti obbligatori (identità, codice fiscale, contratto firmato)."
  },
  {
    key: "accessi_it",
    titleIt: "Accessi IT",
    descriptionIt: "Account, email aziendale, gruppi e strumenti digitali."
  },
  {
    key: "badge",
    titleIt: "Badge e accessi fisici",
    descriptionIt: "Badge, tornelli e permessi sede."
  },
  {
    key: "policy",
    titleIt: "Policy firmate",
    descriptionIt: "Conferma lettura e firma policy aziendali."
  },
  {
    key: "equipment",
    titleIt: "Attrezzatura",
    descriptionIt: "PC, telefono, dotazione e consegna materiali."
  },
  {
    key: "primo_giorno",
    titleIt: "Primo giorno",
    descriptionIt: "Data ingresso, orario, sede e welcome kit."
  },
  {
    key: "buddy_formazione",
    titleIt: "Buddy e formazione",
    descriptionIt: "Assegna buddy e corsi obbligatori/facoltativi."
  }
] as const;

export type HrOnboardingWizardStepKey = (typeof HR_ONBOARDING_WIZARD_STEPS)[number]["key"];

export const HR_ONBOARDING_WIZARD_STEP_COUNT = HR_ONBOARDING_WIZARD_STEPS.length;

/** Checklist lato dipendente (percorso onboarding). */
export const EMPLOYEE_ONBOARDING_CHECKLIST = [
  { id: "emp-welcome", label: "Leggi il messaggio di benvenuto" },
  { id: "emp-settings", label: "Completa profilo e recapiti" },
  { id: "emp-payslips", label: "Verifica accesso cedolini" },
  { id: "emp-policies", label: "Consulta policy aziendali" },
  { id: "emp-team", label: "Conosci manager e team" },
  { id: "emp-formazione", label: "Completa i corsi di formazione" }
] as const;

/** Mapping passi wizard HR → voci checklist lifecycle. */
export const WIZARD_STEP_TO_LIFECYCLE_ITEM: Partial<Record<HrOnboardingWizardStepKey, string>> = {
  anagrafica_contratto: "ob-1",
  accessi_it: "ob-2",
  buddy_formazione: "ob-3",
  badge: "ob-4"
};
