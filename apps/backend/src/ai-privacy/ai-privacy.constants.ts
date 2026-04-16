/** Prefisso token: deve restare insolito per ridurre collisioni nel testo del modello. */
export const AI_TOKEN_PREFIX = "__nexa_ref:";

/** Regex token completo (kind snake_case + id alfanumerico). */
export const AI_TOKEN_BODY_RE = /__nexa_ref:([a-z0-9_]+):([A-Za-z0-9]{8,64})__/g;

/** Env: TTL sessione vault in secondi (default 30 min). */
export const ENV_AI_PRIVACY_SESSION_TTL_SEC = "AI_PRIVACY_SESSION_TTL_SEC";

/** Env: URL Redis opzionale (stesso processo / Render). */
export const ENV_REDIS_URL = "REDIS_URL";
