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

export type HebbMateScopeKind = "self" | "employees" | "company";

export type HebbMateResolvedScope = {
  subjectUserIds: string[];
  scopeKind: HebbMateScopeKind;
  resolvedNames: string[];
};

function isActiveEmployee(user: User): boolean {
  return user.employmentState !== "offboarding";
}

/**
 * Richieste esplicite su tutti i dipendenti / perimetro aziendale
 * (es. «genera contratto smartworking per tutti i dipendenti»).
 */
export function isCompanyWideEmployeeRequest(message: string): boolean {
  return (
    /\btutti(?:\s+e|\s+a|\s+)(?:i\s+|gli\s+|le\s+)?(?:dipendent|collaborat|person|membr|risors)\w*\b/i.test(
      message
    ) ||
    /\btutti\s+i\s+dipendenti\b/i.test(message) ||
    /\bogni\s+(?:dipendent|collaborat|person)\w*\b/i.test(message) ||
    /\btutta\s+l['']?\s*azienda\b/i.test(message) ||
    /\binter[ao]\s+(?:l['']?\s*)?(?:azienda|organico|company)\b/i.test(message) ||
    /\btutto\s+l['']?\s*organico\b/i.test(message) ||
    /\bcompany.?wide\b/i.test(message) ||
    /\bper\s+tutt(?:i|e)\b/i.test(message) ||
    /\bper\s+ciascun(?:e)?\s+(?:dipendent|collaborat)\w*\b/i.test(message) ||
    /\bin\s+batch\b/i.test(message) ||
    /\bmassiv(?:o|a|i|e)?\b/i.test(message)
  );
}

/** Richieste generiche HR (automazioni, timbrature, ecc.) senza nominativi → perimetro aziendale. */
export function isGenericCompanyWideRequest(message: string): boolean {
  return (
    isCompanyWideEmployeeRequest(message) ||
    /\bautomaz/i.test(message) ||
    /\bautomat\b/i.test(message) ||
    /\bschedul/i.test(message) ||
    /\bpianifica/i.test(message) ||
    /\bricorrent/i.test(message) ||
    /\bfrequenz/i.test(message) ||
    /\bcron\b/i.test(message) ||
    /\btimbratur/i.test(message) ||
    /\bpresenz/i.test(message)
  );
}

/**
 * Risolve il perimetro HR citando i nominativi nel messaggio chat.
 * Se nessun nome è riconosciuto e la richiesta è generica → company (tutti i dipendenti visibili).
 * Altrimenti default su self (utente corrente).
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
    if (!canView(user.id) || !isActiveEmployee(user)) {
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

  if (matched.length > 0) {
    return {
      subjectUserIds: matched.map((m) => m.id),
      scopeKind: "employees",
      resolvedNames: matched.map((m) => m.name)
    };
  }

  if (isGenericCompanyWideRequest(message)) {
    const companyWideIds = companyUsers
      .filter((u) => isActiveEmployee(u) && canView(u.id))
      .map((u) => u.id);
    return {
      subjectUserIds: companyWideIds.length ? companyWideIds : [actorUserId],
      scopeKind: "company",
      resolvedNames: []
    };
  }

  return { subjectUserIds: [actorUserId], scopeKind: "self", resolvedNames: [] };
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
