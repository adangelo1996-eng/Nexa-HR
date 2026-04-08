import { Injectable, InternalServerErrorException, Logger, OnModuleDestroy } from "@nestjs/common";
import { Pool, type PoolClient } from "pg";

/**
 * Pool Postgres diretto (URI Supabase) per transazioni multi-statement.
 * Usa `DATABASE_URL` oppure, in assenza, `SUPABASE_DB_URL` (stesso URI usato da `supabase-remote-push` su Render).
 */
@Injectable()
export class DatabasePoolService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabasePoolService.name);
  private readonly pool: Pool | null;

  constructor() {
    const url =
      process.env.DATABASE_URL?.trim() ||
      process.env.SUPABASE_DB_URL?.trim();
    this.pool = url ? new Pool({ connectionString: url, max: 8, idleTimeoutMillis: 30_000 }) : null;
    // #region agent log
    fetch("http://127.0.0.1:7671/ingest/04747ddd-3563-481e-aa3a-8135cb5f9a9b", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "fb5f3b" },
      body: JSON.stringify({
        sessionId: "fb5f3b",
        hypothesisId: "H2",
        location: "database-pool.service.ts:constructor",
        message: "pool init",
        data: { poolConfigured: Boolean(this.pool), hasDatabaseUrl: Boolean(process.env.DATABASE_URL?.trim()), hasSupabaseDbUrl: Boolean(process.env.SUPABASE_DB_URL?.trim()) },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
    if (this.pool) {
      this.logger.log("Pool Postgres diretto inizializzato (transazioni import)");
    }
  }

  onModuleDestroy(): void {
    void this.pool?.end();
  }

  isConfigured(): boolean {
    return this.pool != null;
  }

  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) {
      // #region agent log
      fetch("http://127.0.0.1:7671/ingest/04747ddd-3563-481e-aa3a-8135cb5f9a9b", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "fb5f3b" },
        body: JSON.stringify({
          sessionId: "fb5f3b",
          hypothesisId: "H2",
          location: "database-pool.service.ts:withTransaction",
          message: "no pool — URI Postgres mancante",
          data: {},
          timestamp: Date.now()
        })
      }).catch(() => {});
      // #endregion
      throw new InternalServerErrorException(
        "URI Postgres non configurato: impostare DATABASE_URL o SUPABASE_DB_URL (session mode consigliato, porta 5432)"
      );
    }
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (e) {
      const err = e as NodeJS.ErrnoException & { code?: string };
      // #region agent log
      fetch("http://127.0.0.1:7671/ingest/04747ddd-3563-481e-aa3a-8135cb5f9a9b", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "fb5f3b" },
        body: JSON.stringify({
          sessionId: "fb5f3b",
          hypothesisId: "H1",
          location: "database-pool.service.ts:connect",
          message: "pool.connect failed (rete / Supabase DB down?)",
          data: {
            errno: err.errno ?? null,
            code: err.code ?? null,
            syscall: err.syscall ?? null,
            msgSnippet: String(err.message ?? e).slice(0, 200)
          },
          timestamp: Date.now()
        })
      }).catch(() => {});
      // #endregion
      throw e;
    }
    try {
      await client.query("BEGIN");
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (e) {
      const pg = e as { code?: string; message?: string; name?: string };
      // #region agent log
      fetch("http://127.0.0.1:7671/ingest/04747ddd-3563-481e-aa3a-8135cb5f9a9b", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "fb5f3b" },
        body: JSON.stringify({
          sessionId: "fb5f3b",
          hypothesisId: pg.code === "42P01" ? "H3" : pg.code === "28P01" ? "H4" : "H1_H5",
          location: "database-pool.service.ts:withTransaction:catch",
          message: "transaction/query failed",
          data: {
            pgCode: pg.code ?? null,
            errName: pg.name ?? null,
            msgSnippet: String(pg.message ?? e).slice(0, 240)
          },
          timestamp: Date.now()
        })
      }).catch(() => {});
      // #endregion
      try {
        await client.query("ROLLBACK");
      } catch (rb) {
        this.logger.error(`ROLLBACK fallito: ${rb instanceof Error ? rb.message : rb}`);
      }
      throw e;
    } finally {
      client.release();
    }
  }
}
