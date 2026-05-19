const MAX_CV_CHARS = 12_000;

/**
 * Estrae testo da buffer CV (PDF). Altri formati: fallback vuoto (note/allegato label).
 */
export async function extractCvTextFromBuffer(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  const mime = (mimeType || "").split(";")[0]?.trim().toLowerCase() ?? "";
  const name = (fileName || "").toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf")) {
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
        return normalizeCvText(String(parsed.text ?? ""));
      } finally {
        await parser.destroy();
      }
    } catch {
      return "";
    }
  }
  return "";
}

export function normalizeCvText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_CV_CHARS);
}

export function mergeCvTextSources(parts: Array<string | null | undefined>): string {
  const merged = parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
  return normalizeCvText(merged);
}
