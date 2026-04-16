/** Valore originale associato a un token (solo lato server, mai inviato al modello). */
export interface VaultEntry {
  /** Categoria logica (es. email, fiscal_code) per audit. */
  kind: string;
  /** Valore in chiaro ripristinabile solo fino a scadenza sessione. */
  value: string;
}

export interface AiPrivacySessionMeta {
  companyId: string;
  actorUserId: string;
  /** ISO scadenza assoluta. */
  expiresAtMs: number;
}

export interface SerializedSessionPayload extends AiPrivacySessionMeta {
  /** token → entry */
  vault: Record<string, VaultEntry>;
}
