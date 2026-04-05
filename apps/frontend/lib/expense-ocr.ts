/** Estrae un importo in euro dal testo OCR (scontrini IT / EUR). */

export function guessAmountEurStringFromReceiptOcr(text: string): string | null {
  const flat = text.replace(/\r/g, "\n").replace(/\u00a0/g, " ");
  const patterns: RegExp[] = [
    /TOTALE\s*(?:DA\s*)?PAGARE[:\s]+(?:EUR\s*)?([\d]{1,3}(?:[.,]\d{3})*[.,]\d{2}|[\d]+[.,]\d{2})/i,
    /TOTALE[:\s]+(?:EUR\s*)?([\d]{1,3}(?:[.,]\d{3})*[.,]\d{2}|[\d]+[.,]\d{2})/i,
    /IMPORTO\s*(?:PAGATO)?[:\s]+(?:EUR\s*)?([\d]{1,3}(?:[.,]\d{3})*[.,]\d{2}|[\d]+[.,]\d{2})/i,
    /€\s*([\d]{1,3}(?:[.,]\d{3})*[.,]\d{2}|[\d]+[.,]\d{2})/,
    /EUR\s*([\d]{1,3}(?:[.,]\d{3})*[.,]\d{2}|[\d]+[.,]\d{2})/i,
    /([\d]+[.,]\d{2})\s*€/
  ];
  for (const re of patterns) {
    const m = flat.match(re);
    if (m?.[1]) {
      const raw = m[1].replace(/\./g, "").replace(",", ".");
      if (/^\d+\.\d{2}$/.test(raw)) {
        return raw;
      }
      const alt = m[1].replace(",", ".");
      if (/^\d+\.\d{2}$/.test(alt)) {
        return alt;
      }
    }
  }
  const loose = flat.match(/(\d+[.,]\d{2})(?=\s*(?:EUR|€|E\b|\n|$))/i);
  if (loose?.[1]) {
    return loose[1].replace(",", ".");
  }
  return null;
}
