export type ItalyIrpefBracket = { upToEuros: number; rate: number };

export interface ItalyEmployeeCostAssumptions {
  /**
   * Contributi IVS lavoratore (stima): percentuale sul lordo.
   * Nota: nella realtà dipende da gestione/settore e voci.
   */
  employeeInpsPercent: number;
  /**
   * Contributi datore (stima): percentuale sul lordo.
   * Nota: nella realtà varia per settore/azienda/incentivi.
   */
  employerInpsPercent: number;
  /**
   * Premio INAIL (stima): percentuale sul lordo.
   */
  inailPercent: number;
  /**
   * Accantonamento TFR annuo: lordo/`tfrDivisor` (stima). Default 13.5.
   */
  tfrDivisor: number;
  /**
   * IRPEF a scaglioni: semplificato e versionabile.
   * IMPORTANTE: è una stima, non sostituisce consulente del lavoro.
   */
  irpefBrackets: ItalyIrpefBracket[];
  /**
   * Addizionali stimate (comunale+regionale) come percentuale dell'imponibile annuo.
   * MVP: valore medio indicativo.
   */
  addizionaliPercent: number;
  /**
   * Detrazioni annue base stimate (art. 13) come importo fisso.
   * MVP: stima grossolana per rendere l’output meno “pessimista”.
   */
  detrazioniAnnueEuros: number;
  /**
   * Sconti contributivi/agevolazioni: riduzione % contributi datore (stima).
   * MVP: solo mapping coarse.
   */
  incentives: {
    femaleEmployerInpsDiscountPercent: number;
    under36EmployerInpsDiscountPercent: number;
    southEmployerInpsDiscountPercent: number;
    naspiEmployerInpsDiscountPercent: number;
    protectedCategoriesEmployerInpsDiscountPercent: number;
  };
}

export const ITALY_EMPLOYEE_COST_ASSUMPTIONS_2026_MVP: ItalyEmployeeCostAssumptions = {
  employeeInpsPercent: 9.19,
  employerInpsPercent: 30.0,
  inailPercent: 0.6,
  tfrDivisor: 13.5,
  // Brackets indicativi (semplificati). Aggiornabili senza toccare la UI.
  irpefBrackets: [
    { upToEuros: 28_000, rate: 0.23 },
    { upToEuros: 50_000, rate: 0.35 },
    { upToEuros: Number.POSITIVE_INFINITY, rate: 0.43 }
  ],
  addizionaliPercent: 1.6 / 100,
  detrazioniAnnueEuros: 1_200,
  incentives: {
    femaleEmployerInpsDiscountPercent: 6,
    under36EmployerInpsDiscountPercent: 8,
    southEmployerInpsDiscountPercent: 10,
    naspiEmployerInpsDiscountPercent: 5,
    protectedCategoriesEmployerInpsDiscountPercent: 6
  }
};

