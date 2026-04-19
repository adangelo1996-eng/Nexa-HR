/**
 * Precarica lo snapshot budget personale (Nexa admin) dopo il login.
 * La pagina /personnel-budget consuma la cache al primo load sullo stesso anno/mese.
 */

import { fetchCurrentUser, fetchPersonnelBudget, type PersonnelBudgetSnapshot } from "@/lib/api";
import { sessionCanNexaAdmin, type SessionUser } from "@/lib/auth-session";

const WARM_MAX_AGE_MS = 600_000;

export type PersonnelBudgetWarmPayload = {
  userId: string;
  year: number;
  month: number;
  prefetchedAt: number;
  data: PersonnelBudgetSnapshot;
};

let warmPayload: PersonnelBudgetWarmPayload | null = null;

export function takePersonnelBudgetWarmPayload(
  userId: string,
  year: number,
  month: number
): PersonnelBudgetWarmPayload | null {
  if (!warmPayload) {
    return null;
  }
  if (Date.now() - warmPayload.prefetchedAt > WARM_MAX_AGE_MS) {
    warmPayload = null;
    return null;
  }
  if (warmPayload.userId !== userId || warmPayload.year !== year || warmPayload.month !== month) {
    return null;
  }
  const out = warmPayload;
  warmPayload = null;
  return out;
}

export function prefetchPersonnelBudgetInBackground(token: string): void {
  void (async () => {
    try {
      const me: SessionUser = await fetchCurrentUser(token);
      if (!sessionCanNexaAdmin(me)) {
        return;
      }
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      const data = await fetchPersonnelBudget(token, y, m);
      warmPayload = { userId: me.id, year: y, month: m, prefetchedAt: Date.now(), data };
    } catch {
      /* prefetch best-effort */
    }
  })();
}
