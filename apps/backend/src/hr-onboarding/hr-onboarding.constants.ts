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
