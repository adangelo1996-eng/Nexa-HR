import { NEXA_HR_PLATFORM_NAV } from "./ai-hr-agent";

export type HrCopilotAction = { label: string; rationale: string; evidence: string; href?: string };
export type HrCopilotPanelId = "today" | "people_risk" | "hiring" | "budget_alert";
export type HrCopilotPanel = {
  id: HrCopilotPanelId;
  title: string;
  priority: "high" | "medium" | "low";
  summary: string;
  actions: HrCopilotAction[];
};
export type HrCopilotStructured = { intro: string; panels: HrCopilotPanel[]; reply?: string };

const KNOWN_PATHS = new Set(NEXA_HR_PLATFORM_NAV.map((n) => n.path));
const PANEL_IDS = new Set<HrCopilotPanelId>(["today", "people_risk", "hiring", "budget_alert"]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeHref(href: unknown): string | undefined {
  if (typeof href !== "string") {
    return undefined;
  }
  const trimmed = href.trim();
  if (!trimmed.startsWith("/") || trimmed.includes("://")) {
    return undefined;
  }
  const path = trimmed.split("?")[0]!.split("#")[0]!;
  return KNOWN_PATHS.has(path) ? path : undefined;
}

function parseAction(raw: unknown): HrCopilotAction | null {
  if (!isRecord(raw)) {
    return null;
  }
  const label = typeof raw.label === "string" ? raw.label.trim().slice(0, 80) : "";
  const rationale = typeof raw.rationale === "string" ? raw.rationale.trim().slice(0, 400) : "";
  const evidence = typeof raw.evidence === "string" ? raw.evidence.trim().slice(0, 200) : "";
  if (!label || !rationale) {
    return null;
  }
  const href = normalizeHref(raw.href);
  return href ? { label, rationale, evidence: evidence || "—", href } : { label, rationale, evidence: evidence || "—" };
}

function parsePanel(raw: unknown): HrCopilotPanel | null {
  if (!isRecord(raw)) {
    return null;
  }
  const idRaw = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!PANEL_IDS.has(idRaw as HrCopilotPanelId)) {
    return null;
  }
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 120) : "";
  const summary = typeof raw.summary === "string" ? raw.summary.trim().slice(0, 500) : "";
  const priorityRaw = typeof raw.priority === "string" ? raw.priority.trim().toLowerCase() : "medium";
  const priority = priorityRaw === "high" || priorityRaw === "low" ? priorityRaw : "medium";
  const actionsRaw = Array.isArray(raw.actions) ? raw.actions : [];
  const actions = actionsRaw.map(parseAction).filter((a): a is HrCopilotAction => a !== null).slice(0, 5);
  if (!title || !summary || actions.length === 0) {
    return null;
  }
  return { id: idRaw as HrCopilotPanelId, title, priority, summary, actions };
}

export function parseHrCopilotStructured(raw: unknown): HrCopilotStructured | null {
  if (!isRecord(raw)) {
    return null;
  }
  const intro = typeof raw.intro === "string" ? raw.intro.trim().slice(0, 600) : "";
  const reply = typeof raw.reply === "string" ? raw.reply.trim().slice(0, 2000) : undefined;
  const panelsRaw = Array.isArray(raw.panels) ? raw.panels : [];
  const panels = panelsRaw.map(parsePanel).filter((p): p is HrCopilotPanel => p !== null).slice(0, 4);
  if ((!intro && !reply) || panels.length === 0) {
    return null;
  }
  return { intro: intro || reply?.slice(0, 600) || "Aggiornamento HR Copilot.", panels, reply };
}

export function parseHrCopilotFromEnvelope(data: unknown): HrCopilotStructured | null {
  if (!isRecord(data)) {
    return null;
  }
  const envelope = isRecord(data.envelope) ? data.envelope : data;
  return parseHrCopilotStructured(envelope);
}
