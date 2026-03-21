import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

/**
 * Client browser: necessario per OAuth (Google / Microsoft via Supabase). Senza env pubbliche restituisce null.
 * Dopo il callback OAuth il backend Nest emette il JWT applicativo come per il login password.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (cached !== undefined) {
    return cached;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    cached = null;
    return null;
  }
  cached = createClient(url, key);
  return cached;
}
