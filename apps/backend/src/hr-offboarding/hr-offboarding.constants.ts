export const HR_OFFBOARDING_WIZARD_STEPS = [
  {
    key: "avvio_preavviso",
    titleIt: "Avvio e preavviso",
    descriptionIt: "Motivo uscita, data comunicazione, fine rapporto e mesi di preavviso."
  },
  {
    key: "documenti_uscita",
    titleIt: "Documenti uscita e asset",
    descriptionIt: "Contratto firmato, restituzione dotazioni e documenti di chiusura."
  },
  {
    key: "revoca_accessi_it",
    titleIt: "Revoca accessi IT",
    descriptionIt: "Account, email, VPN, MFA e licenze software."
  },
  {
    key: "badge_fisico",
    titleIt: "Badge e accessi fisici",
    descriptionIt: "Badge, tornelli, chiavi e permessi sede."
  },
  {
    key: "exit_interview",
    titleIt: "Exit interview e note HR",
    descriptionIt: "Colloquio di uscita, feedback e note riservate HR."
  },
  {
    key: "cedolino_finale",
    titleIt: "Cedolino finale e payroll",
    descriptionIt: "Handoff al payroll, TFR, ratei e ultimo cedolino."
  },
  {
    key: "formazione_chiusura",
    titleIt: "Formazione e certificazioni",
    descriptionIt: "Chiusura corsi obbligatori, revoche e consegne attestati."
  },
  {
    key: "completamento",
    titleIt: "Completamento",
    descriptionIt: "Riepilogo checklist e conferma chiusura procedura."
  }
] as const;

export type HrOffboardingWizardStepKey = (typeof HR_OFFBOARDING_WIZARD_STEPS)[number]["key"];

export const HR_OFFBOARDING_WIZARD_STEP_COUNT = HR_OFFBOARDING_WIZARD_STEPS.length;

/** Checklist lato dipendente (percorso offboarding). */
export const EMPLOYEE_OFFBOARDING_CHECKLIST = [
  { id: "emp-workflow", label: "Chiudi richieste workflow aperte" },
  { id: "emp-expenses", label: "Invia note spese in sospeso" },
  { id: "emp-payslips", label: "Scarica ultimi cedolini" },
  { id: "emp-settings", label: "Aggiorna recapiti per comunicazioni finali" },
  { id: "emp-team", label: "Allinea passaggio con il manager" },
  { id: "emp-assets", label: "Restituisci asset aziendali (PC, badge, telefono)" },
  { id: "emp-handover", label: "Completa passaggio di consegna documentazione" }
] as const;
