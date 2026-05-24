export type ItalyIrpefBracket = { upToEuros: number; rate: number };

export interface ItalyEmployeeCostAssumptions {
  /** Contributi IVS lavoratore FPLD (9,19% su imponibile). */
  employeeInpsPercent: number;
  /** Contributi datore FPLD (23,81% standard privato; varia per settore/CCNL). */
  employerInpsPercent: number;
  /** Premio INAIL indicativo (‰ su lordo; default 3‰). */
  inailPercent: number;
  /** Accantonamento TFR: lordo / divisore (art. 2120 c.c.). */
  tfrDivisor: number;
  /** IRPEF a tre scaglioni (strutturale dal 2025). */
  irpefBrackets: ItalyIrpefBracket[];
  /** Addizionale regionale su IRPEF netta mensile (stima media). */
  addizionaleRegionalePercent: number;
  /** Addizionale comunale su IRPEF netta mensile (stima media). */
  addizionaleComunalePercent: number;
  /** Sconti contributivi datore per agevolazioni (stima punti percentuali). */
  incentives: {
    femaleEmployerInpsDiscountPercent: number;
    under36EmployerInpsDiscountPercent: number;
    southEmployerInpsDiscountPercent: number;
    naspiEmployerInpsDiscountPercent: number;
    protectedCategoriesEmployerInpsDiscountPercent: number;
  };
  /** Anno normativo di riferimento (documentazione). */
  regulatoryYear: number;
}

/**
 * Preset 2026 — fonti: L. 207/2024, circ. AE 4/E/2025, INPS FPLD 33% (9,19% + 23,81%).
 * Addizionali: stima media regionale/comunale su IRPEF netta.
 */
export const ITALY_EMPLOYEE_COST_ASSUMPTIONS_2026_MVP: ItalyEmployeeCostAssumptions = {
  regulatoryYear: 2026,
  employeeInpsPercent: 9.19,
  employerInpsPercent: 23.81,
  inailPercent: 0.3,
  tfrDivisor: 13.5,
  irpefBrackets: [
    { upToEuros: 28_000, rate: 0.23 },
    { upToEuros: 50_000, rate: 0.35 },
    { upToEuros: Number.POSITIVE_INFINITY, rate: 0.43 }
  ],
  addizionaleRegionalePercent: 1.23,
  addizionaleComunalePercent: 0.8,
  incentives: {
    femaleEmployerInpsDiscountPercent: 6,
    under36EmployerInpsDiscountPercent: 8,
    southEmployerInpsDiscountPercent: 10,
    naspiEmployerInpsDiscountPercent: 5,
    protectedCategoriesEmployerInpsDiscountPercent: 6
  }
};
