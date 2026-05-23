/** Limiti smart working estratti da contratto (blocchi JSON o testo). */
export interface ParsedRemoteWorkLimits {
  maxRemoteDaysPerWeek: number | null;
  maxRemoteDaysPerMonth: number | null;
  maxRemoteDaysPerYear?: number | null;
  /** Campi raw trovati (audit / debug). */
  extract: Record<string, unknown>;
}

const DEFAULT_WEEK = 2;
const DEFAULT_MONTH = 8;

export const REMOTE_WORK_LIMITS_BLOCK_TYPE = "remote_work_limits";
export const REMOTE_WORKING_QUOTA_BLOCK_TYPE = "remote_working_quota";
export const SMARTWORKING_CLAUSE_BLOCK_TYPE = "smartworking_clause";

function coerceDayCount(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number.parseInt(String(v).trim(), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(n, 366);
}

function readNumericFields(obj: Record<string, unknown>): Partial<ParsedRemoteWorkLimits> {
  const week =
    coerceDayCount(obj.allowedDaysPerWeek) ??
    coerceDayCount(obj.allowedRemoteDaysPerWeek) ??
    coerceDayCount(obj.maxRemoteDaysPerWeek);
  const month =
    coerceDayCount(obj.allowedDaysPerMonth) ??
    coerceDayCount(obj.allowedRemoteDaysPerMonth) ??
    coerceDayCount(obj.maxRemoteDaysPerMonth);
  const year =
    coerceDayCount(obj.allowedDaysPerYear) ??
    coerceDayCount(obj.allowedRemoteDaysPerYear) ??
    coerceDayCount(obj.maxRemoteDaysPerYear);
  return {
    maxRemoteDaysPerWeek: week,
    maxRemoteDaysPerMonth: month,
    maxRemoteDaysPerYear: year
  };
}

/** Estrae limiti da testo libero (PDF o body blocco). */
export function parseRemoteWorkLimitsFromText(text: string): Partial<ParsedRemoteWorkLimits> {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return {};
  }
  let week: number | null = null;
  let month: number | null = null;
  let year: number | null = null;

  const weekMatch =
    normalized.match(/(\d{1,2})\s*(?:gg\.?|giorni?)[^.]{0,40}?\bper\s+settimana\b/i) ??
    normalized.match(/(\d{1,2})\s*(?:gg\.?|giorni?)[^.]{0,40}?(?:settimana|settimanale)/i) ??
    normalized.match(/(?:settimana|settimanale)[^.]{0,40}?(\d{1,2})\s*(?:gg\.?|giorni?)/i);
  if (weekMatch) {
    week = coerceDayCount(weekMatch[1]);
  }

  const monthMatch =
    normalized.match(/(\d{1,2})\s*(?:gg\.?|giorni?)[^.]{0,40}?\bper\s+mese\b/i) ??
    normalized.match(/(\d{1,2})\s*(?:gg\.?|giorni?)\s+(?:di\s+calendario\s+)?(?:al\s+)?mese/i) ??
    normalized.match(/mese[^.]{0,40}?(\d{1,2})\s*(?:gg\.?|giorni?)/i);
  if (monthMatch) {
    month = coerceDayCount(monthMatch[1]);
  }

  const yearMatch = normalized.match(/(\d{1,3})\s*(?:gg\.?|giorni?)[^.]{0,60}?anno/i);
  if (yearMatch) {
    year = coerceDayCount(yearMatch[1]);
  }

  return {
    maxRemoteDaysPerWeek: week,
    maxRemoteDaysPerMonth: month,
    maxRemoteDaysPerYear: year
  };
}

/** Unisce blocchi `hr_standard_contracts.blocks` (editor o batch Cowork). */
export function parseRemoteWorkLimitsFromBlocks(blocks: unknown[]): ParsedRemoteWorkLimits {
  const extract: Record<string, unknown> = { blockTypes: [] as string[] };
  let week: number | null = null;
  let month: number | null = null;
  let year: number | null = null;
  const textParts: string[] = [];

  for (const raw of blocks) {
    if (!raw || typeof raw !== "object") continue;
    const b = raw as Record<string, unknown>;
    const type = String(b.type ?? b.key ?? "").trim();
    if (type) {
      (extract.blockTypes as string[]).push(type);
    }

    if (
      type === REMOTE_WORK_LIMITS_BLOCK_TYPE ||
      type === REMOTE_WORKING_QUOTA_BLOCK_TYPE ||
      type === SMARTWORKING_CLAUSE_BLOCK_TYPE
    ) {
      const nums = readNumericFields(b);
      const meta =
        b.metadata && typeof b.metadata === "object"
          ? readNumericFields(b.metadata as Record<string, unknown>)
          : {};
      const weekN = nums.maxRemoteDaysPerWeek ?? meta.maxRemoteDaysPerWeek;
      const monthN = nums.maxRemoteDaysPerMonth ?? meta.maxRemoteDaysPerMonth;
      const yearN = nums.maxRemoteDaysPerYear ?? meta.maxRemoteDaysPerYear;
      if (weekN != null) week = weekN;
      if (monthN != null) month = monthN;
      if (yearN != null) year = yearN;
    }

    const body = String(b.body ?? b.content ?? "").trim();
    if (body) textParts.push(body);
  }

  if (week == null || month == null) {
    const fromText = parseRemoteWorkLimitsFromText(textParts.join("\n"));
    if (week == null && fromText.maxRemoteDaysPerWeek != null) week = fromText.maxRemoteDaysPerWeek;
    if (month == null && fromText.maxRemoteDaysPerMonth != null) month = fromText.maxRemoteDaysPerMonth;
    if (year == null && fromText.maxRemoteDaysPerYear != null) year = fromText.maxRemoteDaysPerYear;
  }

  return {
    maxRemoteDaysPerWeek: week,
    maxRemoteDaysPerMonth: month,
    maxRemoteDaysPerYear: year ?? null,
    extract: { ...extract, textParsed: week != null || month != null }
  };
}

/** Campi numerici su `party` (batch Nexa HR). */
export function parseRemoteWorkLimitsFromParty(party: Record<string, unknown>): Partial<ParsedRemoteWorkLimits> {
  return readNumericFields(party);
}

export function resolveRemoteWorkLimits(parsed: ParsedRemoteWorkLimits): {
  week: number;
  month: number;
  year: number | null;
} {
  return {
    week: parsed.maxRemoteDaysPerWeek ?? DEFAULT_WEEK,
    month: parsed.maxRemoteDaysPerMonth ?? DEFAULT_MONTH,
    year: parsed.maxRemoteDaysPerYear ?? null
  };
}

export async function extractPdfTextForRemotePolicy(buffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const Parser = PDFParse as unknown as new (opts: { data: Buffer }) => {
      load: () => Promise<void>;
      getText: () => Promise<{ text?: string }>;
      destroy: () => Promise<void>;
    };
    const parser = new Parser({ data: buffer });
    await parser.load();
    try {
      const parsed = await parser.getText();
      return String(parsed.text ?? "").replace(/\s+/g, " ").trim().slice(0, 24_000);
    } finally {
      await parser.destroy();
    }
  } catch {
    return "";
  }
}
