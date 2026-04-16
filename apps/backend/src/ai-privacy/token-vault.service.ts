import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type Redis from "ioredis";
import { ENV_AI_PRIVACY_SESSION_TTL_SEC, ENV_REDIS_URL } from "./ai-privacy.constants";
import { AiPrivacySessionError } from "./ai-privacy.errors";
import type { SerializedSessionPayload, VaultEntry } from "./vault.types";

const REDIS_KEY_PREFIX = "ai_privacy_sess:";

function ttlSecondsFromEnv(): number {
  const raw = process.env[ENV_AI_PRIVACY_SESSION_TTL_SEC];
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 60 && n <= 86400) {
    return Math.floor(n);
  }
  return 1800;
}

@Injectable()
export class TokenVaultService implements OnModuleDestroy {
  private readonly memory = new Map<string, SerializedSessionPayload>();
  private redis: Redis | null = null;
  private redisInit: Promise<void> | null = null;
  private redisDisabled = false;

  onModuleDestroy(): void {
    this.redis?.disconnect();
    this.redis = null;
  }

  private async ensureRedis(): Promise<Redis | null> {
    if (this.redisDisabled) {
      return null;
    }
    const url = process.env[ENV_REDIS_URL]?.trim();
    if (!url) {
      return null;
    }
    if (this.redis) {
      return this.redis;
    }
    if (!this.redisInit) {
      this.redisInit = import("ioredis")
        .then(async ({ default: IORedis }) => {
          const client = new IORedis(url, { maxRetriesPerRequest: 1, lazyConnect: false });
          try {
            await client.ping();
            this.redis = client;
          } catch {
            this.redisDisabled = true;
            await client.quit().catch(() => undefined);
          }
        })
        .catch(() => {
          this.redisDisabled = true;
        });
    }
    await this.redisInit;
    return this.redis;
  }

  private redisKey(sessionId: string): string {
    return `${REDIS_KEY_PREFIX}${sessionId}`;
  }

  private async readPayload(sessionId: string): Promise<SerializedSessionPayload | null> {
    const r = await this.ensureRedis();
    if (r) {
      try {
        const raw = await r.get(this.redisKey(sessionId));
        if (!raw) {
          return null;
        }
        const p = JSON.parse(raw) as SerializedSessionPayload;
        if (Date.now() > p.expiresAtMs) {
          await r.del(this.redisKey(sessionId)).catch(() => undefined);
          return null;
        }
        const remainSec = Math.max(1, Math.ceil((p.expiresAtMs - Date.now()) / 1000));
        await r.expire(this.redisKey(sessionId), remainSec).catch(() => undefined);
        return p;
      } catch {
        return null;
      }
    }
    const m = this.memory.get(sessionId);
    if (!m || Date.now() > m.expiresAtMs) {
      if (m) {
        this.memory.delete(sessionId);
      }
      return null;
    }
    return m;
  }

  private async writePayload(sessionId: string, p: SerializedSessionPayload): Promise<void> {
    const r = await this.ensureRedis();
    if (r) {
      const ttlSec = Math.max(1, Math.ceil((p.expiresAtMs - Date.now()) / 1000));
      await r.set(this.redisKey(sessionId), JSON.stringify(p), "EX", ttlSec);
      return;
    }
    this.memory.set(sessionId, p);
  }

  /**
   * Crea una sessione vault; `companyId` e `actorUserId` servono solo ad audit (non nel payload verso LLM).
   */
  async createSession(companyId: string, actorUserId: string): Promise<string> {
    const sessionId = randomUUID();
    const ttlSec = ttlSecondsFromEnv();
    const expiresAtMs = Date.now() + ttlSec * 1000;
    const payload: SerializedSessionPayload = {
      companyId,
      actorUserId,
      expiresAtMs,
      vault: {}
    };
    await this.writePayload(sessionId, payload);
    return sessionId;
  }

  async assertSessionOpen(sessionId: string): Promise<void> {
    const p = await this.readPayload(sessionId);
    if (!p) {
      throw new AiPrivacySessionError("Sessione AI scaduta o sconosciuta");
    }
  }

  async registerToken(sessionId: string, token: string, entry: VaultEntry): Promise<void> {
    const p = await this.readPayload(sessionId);
    if (!p) {
      throw new AiPrivacySessionError("Sessione AI scaduta o sconosciuta");
    }
    p.vault[token] = entry;
    await this.writePayload(sessionId, p);
  }

  async getEntry(sessionId: string, token: string): Promise<VaultEntry | null> {
    const p = await this.readPayload(sessionId);
    if (!p) {
      return null;
    }
    const e = p.vault[token];
    return e ?? null;
  }

  /** Elenco token emessi (per validazione fail-closed risposta modello). */
  async listIssuedTokens(sessionId: string): Promise<Set<string>> {
    const p = await this.readPayload(sessionId);
    if (!p) {
      return new Set();
    }
    return new Set(Object.keys(p.vault));
  }

  async endSession(sessionId: string): Promise<void> {
    const r = await this.ensureRedis();
    if (r) {
      await r.del(this.redisKey(sessionId)).catch(() => undefined);
    }
    this.memory.delete(sessionId);
  }
}
