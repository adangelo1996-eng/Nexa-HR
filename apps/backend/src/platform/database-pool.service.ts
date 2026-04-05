import { Injectable, InternalServerErrorException, Logger, OnModuleDestroy } from "@nestjs/common";
import { Pool, type PoolClient } from "pg";

/**
 * Pool Postgres diretto (URI Supabase) per transazioni multi-statement.
 * Opzionale: se `DATABASE_URL` manca, il pool non è disponibile.
 */
@Injectable()
export class DatabasePoolService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabasePoolService.name);
  private readonly pool: Pool | null;

  constructor() {
    const url = process.env.DATABASE_URL?.trim();
    this.pool = url ? new Pool({ connectionString: url, max: 8, idleTimeoutMillis: 30_000 }) : null;
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
      throw new InternalServerErrorException("DATABASE_URL non configurato");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (e) {
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
