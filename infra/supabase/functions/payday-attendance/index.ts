import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import * as jose from "npm:jose@5";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

type TimeEntry = {
  id: string;
  userId: string;
  type: "clock_in" | "clock_out";
  at: string;
};

type WorkdaySummary = {
  userId: string;
  date: string;
  minutesWorked: number;
  workedSeconds?: number;
  overtimeSeconds?: number;
  mode: "office" | "smartworking";
};

type UserRow = {
  id: string;
  email: string;
  weeklyContractHours?: number;
  dailyTargetSeconds?: number;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function jsonError(message: string, status: number): Response {
  return json({ message }, status);
}

function normalizeWeeklyContractHours(input?: number): number {
  if (!Number.isFinite(input)) {
    return 40;
  }
  return Math.min(80, Math.max(1, Number(input)));
}

function computeDailyTargetSecondsFromWeekly(weeklyContractHours: number): number {
  return Math.round((weeklyContractHours / 5) * 3600);
}

function resolveDailyTargetSeconds(user: Pick<UserRow, "weeklyContractHours" | "dailyTargetSeconds">): number {
  if (Number.isFinite(user.weeklyContractHours)) {
    return computeDailyTargetSecondsFromWeekly(normalizeWeeklyContractHours(user.weeklyContractHours));
  }
  return user.dailyTargetSeconds ?? 28800;
}

function calculateWorkedSeconds(
  entries: TimeEntry[],
  nowIso?: string
): { workedSeconds: number; hasOpenClockIn: boolean; firstClockInAt?: string } {
  const ordered = [...entries].sort((a, b) => a.at.localeCompare(b.at));
  let openClockInAt: string | undefined;
  let firstClockInAt: string | undefined;
  let workedSeconds = 0;

  for (const entry of ordered) {
    if (entry.type === "clock_in" && !openClockInAt) {
      openClockInAt = entry.at;
      if (!firstClockInAt) {
        firstClockInAt = entry.at;
      }
    } else if (entry.type === "clock_out" && openClockInAt) {
      const delta = Math.floor((new Date(entry.at).getTime() - new Date(openClockInAt).getTime()) / 1000);
      workedSeconds += Math.max(0, delta);
      openClockInAt = undefined;
    }
  }

  if (openClockInAt && nowIso) {
    const openDelta = Math.floor((new Date(nowIso).getTime() - new Date(openClockInAt).getTime()) / 1000);
    workedSeconds += Math.max(0, openDelta);
  }

  return { workedSeconds, hasOpenClockIn: Boolean(openClockInAt), firstClockInAt };
}

function weekRange(referenceDate: string): { start: string; end: string } {
  const target = new Date(`${referenceDate}T00:00:00.000Z`);
  const dayIndex = (target.getUTCDay() + 6) % 7;
  const start = new Date(target);
  start.setUTCDate(start.getUTCDate() - dayIndex);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

async function getAuthContext(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
  service: SupabaseClient
): Promise<{ userId: string; role: string } | Response> {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return jsonError("Autenticazione richiesta", 401);
  }
  const token = header.slice("Bearer ".length).trim();
  const jwtSecret = Deno.env.get("AUTH_JWT_SECRET") ?? "dev-payday-secret-change-me";

  try {
    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jose.jwtVerify(token, secret, { algorithms: ["HS256"] });
    const sub = payload.sub;
    const role = payload.role;
    if (typeof sub === "string" && typeof role === "string") {
      return { userId: sub, role };
    }
  } catch {
    // try Supabase session JWT
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: header } }
  });
  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData.user?.email) {
    return jsonError("Token non valido o scaduto", 401);
  }
  const { data: row, error: rowErr } = await service
    .from("users")
    .select("id, role")
    .ilike("email", authData.user.email.trim())
    .maybeSingle();
  if (rowErr || !row) {
    return jsonError("Utente non provisionato", 403);
  }
  return { userId: row.id as string, role: row.role as string };
}

async function getUser(service: SupabaseClient, userId: string): Promise<UserRow | null> {
  const { data, error } = await service.from("users").select("*").eq("id", userId).maybeSingle();
  if (error || !data) {
    return null;
  }
  return data as UserRow;
}

async function resolveTargetUserId(
  requested: string | null,
  auth: { userId: string; role: string },
  service: SupabaseClient
): Promise<string | Response> {
  if (!requested || requested === auth.userId) {
    return auth.userId;
  }
  if (auth.role === "admin") {
    return requested;
  }
  if (auth.role === "team_lead") {
    const { data } = await service.from("users").select("managerId").eq("id", requested).maybeSingle();
    if (data?.managerId === auth.userId) {
      return requested;
    }
  }
  return jsonError("Permessi insufficienti", 403);
}

async function listTimeEntries(service: SupabaseClient, userId: string, date?: string): Promise<TimeEntry[]> {
  let query = service.from("time_entries").select("*").eq("userId", userId);
  if (date) {
    query = query.like("at", `${date}%`);
  }
  const { data } = await query;
  return ((data as TimeEntry[]) ?? []).sort((a, b) => b.at.localeCompare(a.at));
}

async function listWorkdaySummary(service: SupabaseClient, userId: string, date?: string): Promise<WorkdaySummary[]> {
  let query = service.from("workday_summaries").select("*").eq("userId", userId);
  if (date) {
    query = query.eq("date", date);
  }
  const { data } = await query;
  return ((data as WorkdaySummary[]) ?? []).sort((a, b) => b.date.localeCompare(a.date));
}

async function refreshSummary(service: SupabaseClient, userId: string, date: string): Promise<void> {
  const dayEntries = (await listTimeEntries(service, userId, date)).sort((a, b) => a.at.localeCompare(b.at));
  const workedSeconds = calculateWorkedSeconds(dayEntries).workedSeconds;
  const minutesWorked = Math.floor(workedSeconds / 60);
  const user = await getUser(service, userId);
  if (!user) {
    throw new Error("Utente non trovato");
  }
  const dailyTargetSeconds = resolveDailyTargetSeconds(user);
  const overtimeSeconds = Math.max(0, workedSeconds - dailyTargetSeconds);

  const existing = (await listWorkdaySummary(service, userId)).find((item) => item.date === date);
  if (existing) {
    await service
      .from("workday_summaries")
      .update({ minutesWorked, workedSeconds, overtimeSeconds })
      .eq("userId", userId)
      .eq("date", date);
    return;
  }
  await service.from("workday_summaries").insert({
    userId,
    date,
    minutesWorked,
    workedSeconds,
    overtimeSeconds,
    mode: "office"
  });
}

async function computeClockState(
  service: SupabaseClient,
  userId: string,
  date: string
): Promise<{
  hasOpenClockIn: boolean;
  isRunning: boolean;
  nextType: "clock_in" | "clock_out";
  todayEntries: TimeEntry[];
  minutesWorked: number;
  workedSeconds: number;
  overtimeSeconds: number;
  dailyTargetSeconds: number;
  remainingSeconds: number;
  firstClockInAt?: string;
}> {
  const todayEntries = (await listTimeEntries(service, userId, date)).sort((a, b) => a.at.localeCompare(b.at));
  const live = calculateWorkedSeconds(todayEntries, new Date().toISOString());
  const workedSeconds = live.workedSeconds;
  const minutesWorked = Math.floor(workedSeconds / 60);
  const user = await getUser(service, userId);
  if (!user) {
    throw new Error("Utente non trovato");
  }
  const dailyTargetSeconds = resolveDailyTargetSeconds(user);
  const remainingSeconds = Math.max(0, dailyTargetSeconds - workedSeconds);
  const overtimeSeconds = Math.max(0, workedSeconds - dailyTargetSeconds);
  return {
    hasOpenClockIn: live.hasOpenClockIn,
    isRunning: live.hasOpenClockIn,
    nextType: live.hasOpenClockIn ? "clock_out" : "clock_in",
    todayEntries,
    minutesWorked,
    workedSeconds,
    overtimeSeconds,
    dailyTargetSeconds,
    remainingSeconds,
    firstClockInAt: live.firstClockInAt
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return jsonError("Configurazione server incompleta", 500);
  }

  const service = createClient(supabaseUrl, serviceKey);
  const auth = await getAuthContext(req, supabaseUrl, anonKey, service);
  if (auth instanceof Response) {
    return auth;
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "";

  try {
    if (req.method === "POST" && action === "clock") {
      const body = req.headers.get("content-type")?.includes("application/json")
        ? ((await req.json()) as { type?: string; at?: string })
        : {};
      const type = body.type as "clock_in" | "clock_out" | undefined;
      if (type !== "clock_in" && type !== "clock_out") {
        return jsonError("Tipo timbratura non valido", 400);
      }
      const userId = auth.userId;
      const atIso = typeof body.at === "string" ? body.at : new Date().toISOString();
      const day = atIso.slice(0, 10);
      const clockState = await computeClockState(service, userId, day);
      if (clockState.nextType !== type) {
        if (type === "clock_in") {
          return jsonError("Entrata gia registrata, devi timbrare uscita", 400);
        }
        return jsonError("Devi prima timbrare entrata", 400);
      }
      const entry: TimeEntry = {
        id: `te-${Date.now()}`,
        userId,
        type,
        at: atIso
      };
      await service.from("time_entries").insert(entry);
      await refreshSummary(service, userId, day);
      return json(entry);
    }

    if (req.method === "GET" && action === "entries") {
      const date = url.searchParams.get("date") ?? undefined;
      const requestedUser = url.searchParams.get("userId");
      const target = await resolveTargetUserId(requestedUser, auth, service);
      if (target instanceof Response) {
        return target;
      }
      const rows = await listTimeEntries(service, target, date);
      return json(rows);
    }

    if (req.method === "GET" && action === "summary") {
      const date = url.searchParams.get("date") ?? undefined;
      const requestedUser = url.searchParams.get("userId");
      const target = await resolveTargetUserId(requestedUser, auth, service);
      if (target instanceof Response) {
        return target;
      }
      const rows = await listWorkdaySummary(service, target, date);
      return json(rows);
    }

    if (req.method === "GET" && action === "status") {
      const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
      const state = await computeClockState(service, auth.userId, date);
      return json({
        date,
        hasOpenClockIn: state.hasOpenClockIn,
        isRunning: state.isRunning,
        nextType: state.nextType,
        entriesCount: state.todayEntries.length,
        minutesWorked: state.minutesWorked,
        workedSeconds: state.workedSeconds,
        overtimeSeconds: state.overtimeSeconds,
        dailyTargetSeconds: state.dailyTargetSeconds,
        remainingSeconds: state.remainingSeconds,
        firstClockInAt: state.firstClockInAt
      });
    }

    if (req.method === "GET" && action === "aggregates") {
      const referenceDate = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
      const scope = url.searchParams.get("scope") as "week" | "month" | "year" | null;
      const userId = auth.userId;
      const summaries = await listWorkdaySummary(service, userId);
      const { start, end } = weekRange(referenceDate);
      const monthPrefix = referenceDate.slice(0, 7);
      const yearPrefix = referenceDate.slice(0, 4);
      const user = await getUser(service, userId);
      if (!user) {
        return jsonError("Utente non trovato", 404);
      }
      const targetSeconds = resolveDailyTargetSeconds(user);

      const sumOvertime = (items: WorkdaySummary[]): number =>
        items.reduce((acc, item) => {
          const fallbackOvertime = Math.max(0, (item.workedSeconds ?? item.minutesWorked * 60) - targetSeconds);
          return acc + (item.overtimeSeconds ?? fallbackOvertime);
        }, 0);

      const weekOvertimeSeconds = sumOvertime(summaries.filter((item) => item.date >= start && item.date <= end));
      const monthOvertimeSeconds = sumOvertime(summaries.filter((item) => item.date.startsWith(monthPrefix)));
      const yearOvertimeSeconds = sumOvertime(summaries.filter((item) => item.date.startsWith(yearPrefix)));

      const result = {
        referenceDate,
        week: { overtimeSeconds: weekOvertimeSeconds, overtimeHours: weekOvertimeSeconds / 3600 },
        month: { overtimeSeconds: monthOvertimeSeconds, overtimeHours: monthOvertimeSeconds / 3600 },
        year: { overtimeSeconds: yearOvertimeSeconds, overtimeHours: yearOvertimeSeconds / 3600 }
      };

      if (scope === "week" || scope === "month" || scope === "year") {
        return json({
          scope,
          overtimeSeconds: result[scope].overtimeSeconds,
          overtimeHours: result[scope].overtimeHours
        });
      }
      return json(result);
    }

    return jsonError("Azione non supportata", 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore interno";
    return jsonError(msg, 500);
  }
});
