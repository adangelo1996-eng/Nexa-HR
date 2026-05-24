import type { Route } from "next";
import {
  fetchAiAssistantOrgUsers,
  fetchAttendanceTeamUsers,
  fetchHrRecapPeople,
  fetchMyTeamContext,
  fetchUsers,
  type User
} from "@/lib/api";
import {
  sessionCanAccessHrRecapDashboard,
  sessionCanAccessNexaAiAssistant,
  sessionCanNexaAdmin,
  sessionCanOpenEmployeeRecapPage,
  type SessionUser
} from "@/lib/auth-session";

export type PortalGlobalSearchHit = { href: Route; label: string; subtitle?: string };

const MIN_EMPLOYEE_QUERY_LEN = 2;

function matchesNeedle(hay: string, needle: string): boolean {
  return hay.toLowerCase().includes(needle);
}

function addPersonHit(
  map: Map<string, PortalGlobalSearchHit>,
  id: string,
  fullName: string,
  email: string | undefined,
  needle: string,
  max: number
): void {
  if (map.size >= max || !id.trim()) {
    return;
  }
  const name = fullName.trim();
  if (!name) {
    return;
  }
  const hay = `${name} ${email ?? ""}`.trim();
  if (!matchesNeedle(hay, needle)) {
    return;
  }
  map.set(id, {
    href: `/employee/${encodeURIComponent(id)}` as Route,
    label: `Dipendente · ${name}`,
    subtitle: email?.trim() || undefined
  });
}

function addUsersFromList(
  map: Map<string, PortalGlobalSearchHit>,
  users: Array<{ id: string; fullName: string; email?: string | null }>,
  needle: string,
  max: number
): void {
  for (const u of users) {
    if (map.size >= max) {
      break;
    }
    addPersonHit(map, u.id, u.fullName, u.email ?? undefined, needle, max);
  }
}

/** Ricerca dipendenti per la barra globale: più sorgenti con fallback graceful su 403. */
export async function searchPortalEmployeeDirectory(
  token: string,
  user: SessionUser,
  query: string,
  maxHits = 8
): Promise<PortalGlobalSearchHit[]> {
  const needle = query.trim().toLowerCase();
  if (needle.length < MIN_EMPLOYEE_QUERY_LEN) {
    return [];
  }

  const hits = new Map<string, PortalGlobalSearchHit>();

  addPersonHit(hits, user.id, user.fullName, user.email, needle, maxHits);

  if (sessionCanNexaAdmin(user) || sessionCanOpenEmployeeRecapPage(user)) {
    try {
      const allUsers = await fetchUsers(token);
      addUsersFromList(hits, allUsers as User[], needle, maxHits);
    } catch {
      /* permesso admin_users:read assente — fallback sotto */
    }
  }

  if (hits.size < maxHits && sessionCanAccessNexaAiAssistant(user)) {
    try {
      const res = await fetchAiAssistantOrgUsers(token, needle);
      for (const row of res.users) {
        if (hits.size >= maxHits) {
          break;
        }
        const [name] = row.label.split("·").map((s) => s.trim());
        addPersonHit(hits, row.userId, name || row.label, undefined, needle, maxHits);
      }
    } catch {
      /* scope org non disponibile */
    }
  }

  if (hits.size < maxHits && sessionCanAccessHrRecapDashboard(user)) {
    try {
      const recap = await fetchHrRecapPeople(token, "active");
      addUsersFromList(hits, recap.users ?? [], needle, maxHits);
    } catch {
      /* recap non autorizzato */
    }
  }

  try {
    const ctx = await fetchMyTeamContext(token);
    const teamPeople = [
      ...(ctx.manager ? [{ id: ctx.manager.id, fullName: ctx.manager.fullName }] : []),
      ...ctx.peers,
      ...ctx.directReports
    ];
    addUsersFromList(hits, teamPeople, needle, maxHits);
  } catch {
    /* team context non disponibile */
  }

  try {
    const teamUsers = await fetchAttendanceTeamUsers(token);
    addUsersFromList(
      hits,
      teamUsers.map((u) => ({ id: u.id, fullName: u.fullName, email: u.email })),
      needle,
      maxHits
    );
  } catch {
    /* attendance team picker non disponibile */
  }

  return [...hits.values()].slice(0, maxHits);
}
