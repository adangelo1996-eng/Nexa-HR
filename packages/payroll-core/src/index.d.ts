/**
 * Contratto neutro multi-paese per elaborazione busta paga e export amministrativi.
 */
export type JurisdictionCode = "CH" | "IT";
export type PayrollExportKind = "SEPA_CREDIT" | "F24" | "UNIEMENS" | "PAYSLIP_PDF";
export interface PayrollExportArtifact {
    kind: PayrollExportKind;
    jurisdiction: JurisdictionCode;
    /** Metadati opzionali (path blob, hash, riferimento normativo). */
    reference?: string;
    payload?: Uint8Array;
}
export interface PayrollRunContext {
    companyId: string;
    period: string;
    jurisdiction: JurisdictionCode;
}
/** Porta verso motore di calcolo nazionale (adapter). */
export interface NationalPayrollCalculator {
    readonly jurisdiction: JurisdictionCode;
    calculate(input: unknown): Promise<unknown>;
}
/** Porta verso generazione file export (SEPA, F24, UniEmens). */
export interface PayrollExportGenerator {
    readonly jurisdiction: JurisdictionCode;
    /** Stub: restituisce elenco artefatti pianificati o generati. */
    buildExports(context: PayrollRunContext): Promise<PayrollExportArtifact[]>;
}
