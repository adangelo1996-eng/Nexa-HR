import { NEXA_HR_PLATFORM_NAV } from "./ai-hr-agent";

export type PlatformAgentAction = { label: string; href: string };
export type PlatformAgentBullet = { text: string; action?: PlatformAgentAction };
export type PlatformAgentSection = { title: string; bullets: PlatformAgentBullet[] };
export type PlatformAgentStructured = { sections: PlatformAgentSection[] };

const KNOWN_PATHS = new Set(NEXA_HR_PLATFORM_NAV.map((n) => n.path));

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeHref(href: unknown): string | null {
  if (typeof href !== "string") {
    return null;
  }
  const trimmed = href.trim();
  if (!trimmed.startsWith("/") || trimmed.includes("://")) {
    return null;
  }
  const path = trimmed.split("?")[0]!.split("#")[0]!;
  return KNOWN_PATHS.has(path) ? path : null;
}

function parseAction(raw: unknown): PlatformAgentAction | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const label = typeof raw.label === "string" ? raw.label.trim().slice(0, 80) : "";
  const href = normalizeHref(raw.href);
  if (!label || !href) {
    return undefined;
  }
  return { label, href };
}

function parseBullet(raw: unknown): PlatformAgentBullet | null {
  if (!isRecord(raw)) {
    return null;
  }
  const text = typeof raw.text === "string" ? raw.text.trim().slice(0, 600) : "";
  if (!text) {
    return null;
  }
  const action = parseAction(raw.action);
  return action ? { text, action } : { text };
}

function parseSection(raw: unknown): PlatformAgentSection | null {
  if (!isRecord(raw)) {
    return null;
  }
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 120) : "";
  if (!title) {
    return null;
  }
  const bulletsRaw = Array.isArray(raw.bullets) ? raw.bullets : [];
  const bullets = bulletsRaw.map(parseBullet).filter((b): b is PlatformAgentBullet => b !== null).slice(0, 8);
  if (bullets.length === 0) {
    return null;
  }
  return { title, bullets };
}

export function parsePlatformAgentStructured(raw: unknown): PlatformAgentStructured | null {
  if (!isRecord(raw)) {
    return null;
  }
  const sectionsRaw = Array.isArray(raw.sections) ? raw.sections : [];
  const sections = sectionsRaw.map(parseSection).filter((s): s is PlatformAgentSection => s !== null).slice(0, 5);
  if (sections.length === 0) {
    return null;
  }
  return { sections };
}

export function structuredToPlainReply(structured: PlatformAgentStructured, intro?: string): string {
  const parts: string[] = [];
  if (intro?.trim()) {
    parts.push(intro.trim());
  }
  for (const section of structured.sections) {
    parts.push(`${section.title}\n${section.bullets.map((b) => `• ${b.text}`).join("\n")}`);
  }
  return parts.join("\n\n");
}

export function tryParseStructuredFromText(text: string): PlatformAgentStructured | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (isRecord(parsed) && Array.isArray(parsed.sections)) {
      return parsePlatformAgentStructured(parsed);
    }
    if (isRecord(parsed) && isRecord(parsed.envelope)) {
      return parsePlatformAgentStructured(parsed.envelope);
    }
  } catch {
    return null;
  }
  return null;
}
