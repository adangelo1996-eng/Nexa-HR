import type { PlatformAgentStructuredDto } from "@/lib/api";

/** Fallback: estrae sezioni da testo markdown/plain quando il backend non invia JSON strutturato. */
export function parseGuideMarkdownFallback(text: string): PlatformAgentStructuredDto | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && "sections" in parsed) {
        return parsed as PlatformAgentStructuredDto;
      }
    } catch {
      /* prosegui con markdown */
    }
  }

  const lines = trimmed.split(/\r?\n/);
  const sections: PlatformAgentStructuredDto["sections"] = [];
  let current: { title: string; bullets: PlatformAgentStructuredDto["sections"][0]["bullets"] } | null = null;

  const pushBullet = (line: string): void => {
    const linkMatch = line.match(/\[([^\]]+)\]\((\/[^)]+)\)/);
    const action = linkMatch
      ? { label: linkMatch[1]!.trim().slice(0, 80), href: linkMatch[2]!.trim() }
      : undefined;
    const textOnly = line
      .replace(/^[-*•]\s*/, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .trim();
    if (!textOnly) {
      return;
    }
    if (!current) {
      current = { title: "Risposta", bullets: [] };
      sections.push(current);
    }
    current.bullets.push(action ? { text: textOnly, action } : { text: textOnly });
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    const headerMatch = line.match(/^#{1,3}\s+(.+)$/) || line.match(/^([A-ZÀ-Ú][^:]{2,40}):\s*$/);
    if (headerMatch) {
      current = { title: headerMatch[1]!.trim(), bullets: [] };
      sections.push(current);
      continue;
    }
    if (/^[-*•]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
      pushBullet(line.replace(/^\d+[.)]\s+/, ""));
      continue;
    }
    if (/\[.+\]\(\//.test(line)) {
      pushBullet(line);
    }
  }

  return sections.length > 0 ? { sections } : null;
}
