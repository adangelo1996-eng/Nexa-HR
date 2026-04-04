/**
 * Rigenera `packages/payroll-it-rules/src/como-municipal-rates.generated.ts` da `addizionali_como_2025.md`.
 *
 * Formato tabella atteso (markdown pipe):
 *   | Comune | Aliquota_vigente_%_2025_2026 |
 * Valori in percentuale (es. 0.7 = 0,70%) → nel TS salvati come frazione (0.007).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const mdPath = path.join(root, "addizionali_como_2025.md");
const t = fs.readFileSync(mdPath, "utf8");

function norm(s) {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\u2019/g, "'")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

const rows = [];
for (const line of t.split("\n")) {
  if (!line.startsWith("|")) continue;
  if (line.includes("---")) continue;
  const parts = line
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) continue;
  const name = parts[0];
  const col2 = parts[1];
  if (/^comune$/i.test(name)) continue;
  if (/^aliquota/i.test(col2)) continue;
  const pct = Number(col2.replace(",", "."));
  if (!name || Number.isNaN(pct)) continue;
  rows.push({ name, vigentePct: pct });
}

const map = {};
for (const r of rows) {
  const frac = Math.round((r.vigentePct / 100) * 1e8) / 1e8;
  map[norm(r.name)] = { vigente: frac };
}

const header = `/**
 * Aliquote addizionale comunale IRPEF — provincia di Como (fonte: addizionali_como_2025.md).
 * Colonna sorgente: Aliquota_vigente_%_2025_2026 (percentuale → qui come frazione, 0.007 = 0,70%).
 * Generato da scripts/gen-como-rates.mjs — non editare a mano.
 */
`;

const body = `export const COMO_MUNICIPAL_ADDIZIONALE_RATES: Record<string, { vigente: number }> = ${JSON.stringify(map, null, 2)};
`;

const outPath = path.join(root, "packages/payroll-it-rules/src/como-municipal-rates.generated.ts");
fs.writeFileSync(outPath, header + body);
console.log("Wrote", outPath, Object.keys(map).length, "comuni");
