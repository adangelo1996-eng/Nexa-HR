import type { User } from "@payday/domain";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function namePatterns(user: User): string[] {
  const patterns: string[] = [];
  const fn = user.firstName?.trim();
  const ln = user.lastName?.trim();
  const full = user.fullName?.trim();
  if (full && full.length >= 3) {
    patterns.push(full);
  }
  if (fn && ln && `${fn} ${ln}`.toLowerCase() !== full?.toLowerCase()) {
    patterns.push(`${fn} ${ln}`);
  }
  return patterns;
}

export type HebbMateResolvedScope = {
  subjectUserIds: string[];
  scopeKind: "self" | "employees";
  resolvedNames: string[];
};

/**
 * Risolve il perimetro HR citando i nominativi nel messaggio chat.
 * Se nessun nome è riconosciuto, default su self (utente corrente).
 */
export function resolveEmployeesFromMessage(
  message: string,
  companyUsers: User[],
  actorUserId: string,
  canView: (userId: string) => boolean
): HebbMateResolvedScope {
  const matched: Array<{ id: string; name: string }> = [];
  const seen = new Set<string>();

  for (const user of companyUsers) {
    if (!canView(user.id)) {
      continue;
    }
    for (const pattern of namePatterns(user)) {
      const re = new RegExp(`\\b${escapeRegex(pattern)}\\b`, "i");
      if (re.test(message)) {
        if (!seen.has(user.id)) {
          seen.add(user.id);
          matched.push({ id: user.id, name: user.fullName });
        }
        break;
      }
    }
  }

  if (matched.length === 0) {
    return { subjectUserIds: [actorUserId], scopeKind: "self", resolvedNames: [] };
  }

  return {
    subjectUserIds: matched.map((m) => m.id),
    scopeKind: "employees",
    resolvedNames: matched.map((m) => m.name)
  };
}

export function assistantScopeFromResolved(resolved: HebbMateResolvedScope): {
  mode: "self" | "user";
  userId?: string;
  userIds?: string[];
} {
  if (resolved.scopeKind === "self") {
    return { mode: "self" };
  }
  if (resolved.subjectUserIds.length === 1) {
    return { mode: "user", userId: resolved.subjectUserIds[0] };
  }
  return { mode: "user", userIds: resolved.subjectUserIds };
}
