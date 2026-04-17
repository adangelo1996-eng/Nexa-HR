import { BadRequestException } from "@nestjs/common";

function normName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Impedisce che il testo libero contenga nominativi noti in anagrafica (nome completo).
 * L’identificazione della persona avviene solo tramite scope strutturato, non dalla chat.
 */
export function assertMessageHasNoKnownPersonFullNames(
  message: string,
  directory: { fullName: string; firstName?: string; lastName?: string }[]
): void {
  const msg = normName(message);
  if (!msg) {
    return;
  }
  for (const row of directory) {
    const full = normName(row.fullName);
    if (full.length >= 5 && msg.includes(full)) {
      throw new BadRequestException(
        "Nel messaggio non inserire nomi o cognomi di persone: indica solo cosa vuoi sapere; la persona o il gruppo vanno scelti nell’ambito sopra la chat."
      );
    }
    const fn = row.firstName ? normName(row.firstName) : "";
    const ln = row.lastName ? normName(row.lastName) : "";
    if (fn.length >= 2 && ln.length >= 2) {
      const combo = `${fn} ${ln}`;
      if (combo.length >= 5 && msg.includes(combo)) {
        throw new BadRequestException(
          "Nel messaggio non inserire nomi o cognomi di persone: indica solo cosa vuoi sapere; la persona o il gruppo vanno scelti nell’ambito sopra la chat."
        );
      }
    }
  }
}
