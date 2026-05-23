import { Injectable } from "@nestjs/common";
import { depseudonymizeFromModel } from "./depseudonymize-json";
import { countVaultTokens, pseudonymizeForAi } from "./pseudonymize-json";
import {
  pseudonymizeFreeTextForAi,
  type PersonDirectoryEntry
} from "./pseudonymize-free-text";
import { TokenVaultService } from "./token-vault.service";

/**
 * Gateway unico per il confine dati → modello AI.
 * Non loggare mai payload in chiaro: solo `sessionId`, `schemaVersion` e conteggi.
 */
@Injectable()
export class AiPrivacyGateway {
  constructor(private readonly vault: TokenVaultService) {}

  async beginSession(companyId: string, actorUserId: string): Promise<{ sessionId: string }> {
    const sessionId = await this.vault.createSession(companyId, actorUserId);
    return { sessionId };
  }

  /**
   * Trasforma un payload JSON arbitrario in versione inviabile al modello (token + vault lato server).
   */
  async toModelPayload(
    sessionId: string,
    raw: unknown,
    schemaVersion: string
  ): Promise<{ pseudonymized: unknown; schemaVersion: string; tokenCount: number }> {
    await this.vault.assertSessionOpen(sessionId);
    const pseudonymized = await pseudonymizeForAi(raw, sessionId, this.vault);
    const tokenCount = await countVaultTokens(sessionId, this.vault);
    void schemaVersion;
    return { pseudonymized, schemaVersion, tokenCount };
  }

  /**
   * Ripristina la risposta strutturata del modello usando solo token noti alla sessione.
   */
  async fromModelResponse(sessionId: string, modelJson: unknown): Promise<unknown> {
    await this.vault.assertSessionOpen(sessionId);
    return depseudonymizeFromModel(modelJson, sessionId, this.vault);
  }

  async endSession(sessionId: string): Promise<void> {
    await this.vault.endSession(sessionId);
  }

  /**
   * Traduce nominativi/email noti in token prima dell'invio al modello (testo libero, es. messaggio Cowork).
   */
  async pseudonymizeFreeText(
    sessionId: string,
    text: string,
    directory: PersonDirectoryEntry[]
  ): Promise<{ text: string; replacementCount: number }> {
    await this.vault.assertSessionOpen(sessionId);
    return pseudonymizeFreeTextForAi(text, directory, sessionId, this.vault);
  }
}
