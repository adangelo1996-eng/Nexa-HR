const DEV_DEFAULT = "dev-payday-secret-change-me";

/**
 * Segreto JWT applicativo (login Nest / QR / SSO app). In produzione obbligatorio e non debole.
 */
export function getAuthJwtSecret(): string {
  const s = process.env.AUTH_JWT_SECRET?.trim();
  const isProd = process.env.NODE_ENV === "production";
  if (!s) {
    if (isProd) {
      throw new Error("AUTH_JWT_SECRET is required in production");
    }
    return DEV_DEFAULT;
  }
  if (isProd && s === DEV_DEFAULT) {
    throw new Error("AUTH_JWT_SECRET must not use the development default in production");
  }
  return s;
}

/**
 * Chiamare all'avvio del processo (dopo dotenv). Fallisce in produzione con configurazione insicura.
 */
export function assertProductionAuthConfig(): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }
  getAuthJwtSecret();
  const supabasePasswordMode = Boolean(
    process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
  if (!supabasePasswordMode) {
    const legacy = process.env.AUTH_SHARED_PASSWORD?.trim() || process.env.AUTH_PASSWORD?.trim();
    if (!legacy) {
      throw new Error(
        "In production set Supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) for password login, or set AUTH_SHARED_PASSWORD"
      );
    }
  }
}
