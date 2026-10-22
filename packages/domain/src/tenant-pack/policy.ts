/** Cosa si configura sul prodotto standard e cosa resta custom (niente fork). */

export const CONFIGURABLE_WITHOUT_CODE = [
  "Scelta di un template di attività dalla lista supportata",
  "Accensione/spegnimento delle capability opzionali del catalogo",
  "Limiti (dipendenti, seat HR, dataset Plasticity)",
  "Default (anno fiscale, ore, valuta, paese payroll, mensilità)",
  "Parametri workflow da enum (approvazione spese, approvatore ferie)",
  "KPI scelti dai cataloghi Nexa e Plasticity",
  "Campi anagrafica extra dalla whitelist",
  "Eccezioni custom datate, senza nuovo codice"
] as const;

export const REQUIRES_CUSTOM_EXCEPTION = [
  "Nuovo modulo o schermata non presente nel catalogo",
  "Nuovo tipo di workflow o stato fuori dagli enum",
  "Formula KPI o voce di bilancio non in catalogo",
  "Colonna anagrafica o tabella SQL fuori whitelist",
  "Fork di codice o build dedicata per un cliente",
  "Integrazione verticale one-off (connettore non suite)"
] as const;

export const CUSTOM_POLICY_SUMMARY_IT =
  "Si personalizza solo per configurazione. Se serve codice nuovo, è un'eccezione custom: va registrata sul pacchetto con motivazione e data di revisione, e non si fa fork del prodotto.";
