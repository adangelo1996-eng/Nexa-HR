import { Type } from "class-transformer";
import { IsIn, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";

/** Ruolo operativo HEBB (non il ruolo auth grezzo). */
export type HebbPageContextUserRole = "superuser" | "hr" | "manager" | "employee";

export type HebbEmploymentState = "active" | "hr_onboarding" | "offboarding";

/** Contesto pagina inviato dal frontend a ogni sessione HEBB. */
export interface HebbPageContext {
  currentPath: string;
  pageLabel: string;
  userRole: HebbPageContextUserRole;
  companyId: string;
  teamScope?: string;
  costCenterScope?: string;
  employmentState?: HebbEmploymentState;
  pageHelp: string;
}

export class HebbPageContextDto {
  @IsString()
  @MaxLength(512)
  currentPath!: string;

  @IsString()
  @MaxLength(256)
  pageLabel!: string;

  @IsIn(["superuser", "hr", "manager", "employee"])
  userRole!: HebbPageContextUserRole;

  @IsString()
  @MaxLength(120)
  companyId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  teamScope?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  costCenterScope?: string;

  @IsOptional()
  @IsIn(["active", "hr_onboarding", "offboarding"])
  employmentState?: HebbEmploymentState;

  @IsString()
  @MaxLength(1200)
  pageHelp!: string;
}

/** Istruzione aggiuntiva per prompt LLM (italiano). */
export const HEBB_PAGE_CONTEXT_PROMPT_HINT =
  "Usa il contesto pagina (pageContext: percorso, etichetta, ruolo utente, company, teamScope/costCenterScope se presenti, employmentState, pageHelp) per risposte specifiche al contesto Nexa; non dare consigli generici se i facts indicano pagina e ruolo.";

export function normalizeHebbPageContext(raw?: HebbPageContextDto | null): HebbPageContext | null {
  if (!raw?.currentPath?.trim() || !raw.companyId?.trim()) {
    return null;
  }
  return {
    currentPath: raw.currentPath.trim().slice(0, 512),
    pageLabel: (raw.pageLabel ?? raw.currentPath).trim().slice(0, 256),
    userRole: raw.userRole,
    companyId: raw.companyId.trim().slice(0, 120),
    teamScope: raw.teamScope?.trim().slice(0, 120) || undefined,
    costCenterScope: raw.costCenterScope?.trim().slice(0, 120) || undefined,
    employmentState: raw.employmentState,
    pageHelp: (raw.pageHelp ?? "").trim().slice(0, 1200)
  };
}

/** Unisce pageContext nei facts/envelope e mantiene `page` legacy = currentPath. */
export function applyHebbPageContextToRecord(
  target: Record<string, unknown>,
  pageContext?: HebbPageContext | null,
  legacyPage?: string | null
): void {
  if (pageContext) {
    target.pageContext = pageContext;
    target.page = pageContext.currentPath;
    return;
  }
  if (legacyPage != null) {
    target.page = legacyPage;
  }
}
