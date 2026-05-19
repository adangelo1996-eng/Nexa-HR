import { BadRequestException } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Rigenerazione competenze aziendali da ruoli catalogo (`users.roleId` → `roles.name` come job title).
 *
 * Flusso:
 * 1. Garantisce taxonomia `hr_skills` (catalogo standard per company).
 * 2. Legge `hr_role_skill_templates` (globali + override tenant) e risolve match su ogni ruolo in uso.
 * 3. Con `apply=true`: upsert `hr_role_skill_requirements`; opz. backfill `hr_user_skills` solo righe mancanti.
 * 4. Con `replaceRoleRequirements=true` richiede `backup=true`: snapshot JSON + rimozione fabbisogni obsoleti per ruoli rigenerati.
 *
 * Non sovrascrive mai livelli utente esistenti salvo `overwriteUserSkills=true` (con backup).
 */

export const STANDARD_HR_SKILL_CATALOG: Array<{ code: string; name: string; description: string }> = [
  { code: "skill.typescript", name: "TypeScript / React", description: "Sviluppo UI, design system, accessibilità" },
  { code: "skill.golang", name: "Go — servizi backend", description: "API, resilienza, osservabilità" },
  { code: "skill.sql", name: "SQL / Postgres", description: "Query, indici, dati HR aggregati" },
  { code: "skill.people_mgmt", name: "People management", description: "Feedback, obiettivi, clima di team" },
  { code: "skill.payroll_it", name: "Payroll Italia", description: "Cedolini, trattenute, CCNL di riferimento" },
  { code: "skill.communication", name: "Comunicazione interna", description: "Allineamento stakeholder, scrittura chiara" },
  { code: "skill.data_privacy", name: "Privacy dati HR", description: "Minimizzazione, accessi, audit" },
  { code: "skill.recruiting", name: "Recruiting operativo", description: "Sourcing, colloqui strutturati, employer branding" }
];

export type RoleSkillTemplateRow = {
  company_id: string | null;
  match_kind: "role_id" | "role_name_exact" | "role_name_contains";
  match_value: string;
  skill_code: string;
  min_level: number;
  default_user_level: number | null;
  sort_order: number;
};

export type SkillsRegenerationOptions = {
  companyId: string;
  /** Se true (default quando apply=false): solo report, nessuna scrittura. */
  dryRun: boolean;
  /** Se true: esegue upsert/backfill (richiede dryRun=false o viene forzato apply). */
  apply: boolean;
  /** Inserisce hr_user_skills mancanti da fabbisogno ruolo (ON CONFLICT DO NOTHING). */
  backfillUsers?: boolean;
  /** Rimuove fabbisogni ruolo non più nel profilo calcolato (richiede backup). */
  replaceRoleRequirements?: boolean;
  /** Salva snapshot in hr_skills_regeneration_snapshots prima di replace/delete. */
  backup?: boolean;
  /** Aggiorna livelli utente già presenti (richiede backup). */
  overwriteUserSkills?: boolean;
  createdBy?: string;
};

export type SkillsRegenerationReport = {
  dryRun: boolean;
  applied: boolean;
  companyId: string;
  rolesInScope: string[];
  skillsCatalogUpserted: number;
  roleRequirementsPlanned: number;
  roleRequirementsUpserted: number;
  roleRequirementsRemoved: number;
  userSkillsPlanned: number;
  userSkillsInserted: number;
  userSkillsUpdated: number;
  snapshotId?: string;
  warnings: string[];
  sampleRoleRequirements: Array<{
    roleId: string;
    roleName: string;
    skillCode: string;
    minLevel: number;
  }>;
};

type RoleRow = { id: string; name: string };
type UserRow = { id: string; roleId: string | null; role: string };
type SkillRow = { id: string; code: string };

function normalizeRoleName(name: string): string {
  return name.trim().toLowerCase();
}

/** Risolve template applicabili a un ruolo; unione per skill_code con min_level massimo. */
export function resolveTemplatesForRole(
  role: RoleRow,
  templates: RoleSkillTemplateRow[]
): Map<string, { minLevel: number; defaultUserLevel: number }> {
  const roleName = normalizeRoleName(role.name);
  const roleId = role.id.trim();
  const matched: RoleSkillTemplateRow[] = [];

  for (const t of templates) {
    const mv = t.match_value.trim();
    if (t.match_kind === "role_id" && mv === roleId) {
      matched.push(t);
      continue;
    }
    if (t.match_kind === "role_name_exact" && normalizeRoleName(mv) === roleName) {
      matched.push(t);
      continue;
    }
    if (t.match_kind === "role_name_contains" && roleName.includes(mv.toLowerCase())) {
      matched.push(t);
    }
  }

  matched.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const out = new Map<string, { minLevel: number; defaultUserLevel: number }>();
  for (const t of matched) {
    const code = t.skill_code.trim();
    if (!code) {
      continue;
    }
    const minLevel = Math.min(5, Math.max(1, Number(t.min_level) || 3));
    const defaultUserLevel = Math.min(
      5,
      Math.max(1, Number(t.default_user_level ?? t.min_level) || minLevel)
    );
    const prev = out.get(code);
    if (!prev || prev.minLevel < minLevel) {
      out.set(code, { minLevel, defaultUserLevel });
    }
  }
  return out;
}

export async function regenerateSkillsFromRoles(
  sb: SupabaseClient,
  options: SkillsRegenerationOptions
): Promise<SkillsRegenerationReport> {
  const companyId = options.companyId.trim();
  if (!companyId) {
    throw new BadRequestException("companyId obbligatorio");
  }

  const apply = Boolean(options.apply);
  const dryRun = !apply;
  const backfillUsers = Boolean(options.backfillUsers);
  const replaceRoleRequirements = Boolean(options.replaceRoleRequirements);
  const backup = Boolean(options.backup);
  const overwriteUserSkills = Boolean(options.overwriteUserSkills);
  const warnings: string[] = [];

  if (replaceRoleRequirements && !backup) {
    throw new BadRequestException("replaceRoleRequirements richiede backup=true");
  }
  if (overwriteUserSkills && !backup) {
    throw new BadRequestException("overwriteUserSkills richiede backup=true");
  }
  if (options.dryRun === false && !apply) {
    warnings.push("dryRun=false senza apply=true: nessuna scrittura (usa apply=true).");
  }

  let skillsCatalogUpserted = 0;
  if (apply) {
    const rows = STANDARD_HR_SKILL_CATALOG.map((s) => ({
      company_id: companyId,
      code: s.code,
      name: s.name,
      description: s.description
    }));
    const { error } = await sb.from("hr_skills").upsert(rows, { onConflict: "company_id,code", ignoreDuplicates: true });
    if (error) {
      throw new BadRequestException(`Upsert catalogo skills: ${error.message}`);
    }
    skillsCatalogUpserted = rows.length;
  }

  const { data: skillRows, error: skillsErr } = await sb
    .from("hr_skills")
    .select("id, code")
    .eq("company_id", companyId);
  if (skillsErr) {
    throw new BadRequestException(`Lettura hr_skills: ${skillsErr.message}`);
  }
  const skillByCode = new Map(((skillRows ?? []) as SkillRow[]).map((s) => [s.code, s.id]));

  const { data: usersRaw, error: usersErr } = await sb
    .from("users")
    .select('id, "roleId", role')
    .eq("companyId", companyId);
  if (usersErr) {
    throw new BadRequestException(`Lettura utenti: ${usersErr.message}`);
  }
  const users = ((usersRaw ?? []) as UserRow[]).filter((u) => u.role !== "superuser");

  const roleIdsFromUsers = [
    ...new Set(users.map((u) => (u.roleId ?? "").trim()).filter(Boolean))
  ];

  const { data: rolesRaw, error: rolesErr } = await sb.from("roles").select("id, name");
  if (rolesErr) {
    throw new BadRequestException(`Lettura roles: ${rolesErr.message}`);
  }
  const allRoles = (rolesRaw ?? []) as RoleRow[];
  const rolesInScope =
    roleIdsFromUsers.length > 0
      ? allRoles.filter((r) => roleIdsFromUsers.includes(r.id))
      : allRoles;

  if (rolesInScope.length === 0) {
    warnings.push("Nessun ruolo catalogo in scope (verificare users.roleId).");
  }

  const { data: templatesRaw, error: tmplErr } = await sb
    .from("hr_role_skill_templates")
    .select("company_id, match_kind, match_value, skill_code, min_level, default_user_level, sort_order")
    .or(`company_id.is.null,company_id.eq.${companyId}`);
  if (tmplErr) {
    throw new BadRequestException(`Lettura template: ${tmplErr.message}`);
  }
  const templates = (templatesRaw ?? []) as RoleSkillTemplateRow[];

  const reqPlanned: Array<{
    roleId: string;
    roleName: string;
    skillId: string;
    skillCode: string;
    minLevel: number;
    defaultUserLevel: number;
  }> = [];

  for (const role of rolesInScope) {
    const profile = resolveTemplatesForRole(role, templates);
    for (const [skillCode, levels] of profile) {
      const skillId = skillByCode.get(skillCode);
      if (!skillId) {
        warnings.push(`Skill ${skillCode} assente per company ${companyId} (saltata per ruolo ${role.name}).`);
        continue;
      }
      reqPlanned.push({
        roleId: role.id,
        roleName: role.name,
        skillId,
        skillCode,
        minLevel: levels.minLevel,
        defaultUserLevel: levels.defaultUserLevel
      });
    }
  }

  const userSkillPlanned: Array<{
    userId: string;
    skillId: string;
    skillCode: string;
    level: number;
  }> = [];

  if (backfillUsers) {
    const reqsByRole = new Map<string, typeof reqPlanned>();
    for (const r of reqPlanned) {
      const list = reqsByRole.get(r.roleId) ?? [];
      list.push(r);
      reqsByRole.set(r.roleId, list);
    }
    for (const u of users) {
      const rid = (u.roleId ?? "").trim();
      if (!rid) {
        continue;
      }
      for (const req of reqsByRole.get(rid) ?? []) {
        userSkillPlanned.push({
          userId: u.id,
          skillId: req.skillId,
          skillCode: req.skillCode,
          level: req.defaultUserLevel
        });
      }
    }
  }

  const report: SkillsRegenerationReport = {
    dryRun,
    applied: false,
    companyId,
    rolesInScope: rolesInScope.map((r) => r.id),
    skillsCatalogUpserted,
    roleRequirementsPlanned: reqPlanned.length,
    roleRequirementsUpserted: 0,
    roleRequirementsRemoved: 0,
    userSkillsPlanned: userSkillPlanned.length,
    userSkillsInserted: 0,
    userSkillsUpdated: 0,
    warnings,
    sampleRoleRequirements: reqPlanned.slice(0, 25).map((r) => ({
      roleId: r.roleId,
      roleName: r.roleName,
      skillCode: r.skillCode,
      minLevel: r.minLevel
    }))
  };

  if (!apply) {
    return report;
  }

  let snapshotId: string | undefined;

  if (backup && (replaceRoleRequirements || overwriteUserSkills)) {
    const roleIds = [...new Set(reqPlanned.map((r) => r.roleId))];
    const { data: existingReqs } = await sb
      .from("hr_role_skill_requirements")
      .select("*")
      .eq("company_id", companyId)
      .in("role_id", roleIds.length ? roleIds : ["__none__"]);

    let existingUserSkills: unknown[] = [];
    if (overwriteUserSkills) {
      const userIds = [...new Set(userSkillPlanned.map((u) => u.userId))];
      const { data: us } = await sb
        .from("hr_user_skills")
        .select("*")
        .eq("company_id", companyId)
        .in("user_id", userIds.length ? userIds : ["__none__"]);
      existingUserSkills = us ?? [];
    }

    const payload = {
      at: new Date().toISOString(),
      roleIds,
      hr_role_skill_requirements: existingReqs ?? [],
      hr_user_skills: existingUserSkills
    };

    if (apply) {
      const { data: snap, error: snapErr } = await sb
        .from("hr_skills_regeneration_snapshots")
        .insert({
          company_id: companyId,
          created_by: options.createdBy ?? null,
          payload
        })
        .select("id")
        .single();
      if (snapErr) {
        throw new BadRequestException(`Backup snapshot: ${snapErr.message}`);
      }
      snapshotId = (snap as { id: string }).id;
    }
  }

  report.snapshotId = snapshotId;

  if (reqPlanned.length > 0 && apply) {
    const upsertRows = reqPlanned.map((r) => ({
      company_id: companyId,
      role_id: r.roleId,
      skill_id: r.skillId,
      min_level: r.minLevel
    }));
    const { error: upErr } = await sb
      .from("hr_role_skill_requirements")
      .upsert(upsertRows, { onConflict: "role_id,skill_id" });
    if (upErr) {
      throw new BadRequestException(`Upsert fabbisogni ruolo: ${upErr.message}`);
    }
    report.roleRequirementsUpserted = upsertRows.length;

    if (replaceRoleRequirements) {
      const roleIds = [...new Set(reqPlanned.map((r) => r.roleId))];
      const keepPairs = new Set(reqPlanned.map((r) => `${r.roleId}|${r.skillId}`));
      const { data: current } = await sb
        .from("hr_role_skill_requirements")
        .select("id, role_id, skill_id")
        .eq("company_id", companyId)
        .in("role_id", roleIds);
      const toDelete = ((current ?? []) as Array<{ id: string; role_id: string; skill_id: string }>).filter(
        (row) => !keepPairs.has(`${row.role_id}|${row.skill_id}`)
      );
      if (toDelete.length > 0) {
        const { error: delErr } = await sb
          .from("hr_role_skill_requirements")
          .delete()
          .in(
            "id",
            toDelete.map((r) => r.id)
          );
        if (delErr) {
          throw new BadRequestException(`Rimozione fabbisogni obsoleti: ${delErr.message}`);
        }
        report.roleRequirementsRemoved = toDelete.length;
      }
    }
  }

  if (backfillUsers && userSkillPlanned.length > 0 && apply) {
    const { data: existingUs } = await sb
      .from("hr_user_skills")
      .select("user_id, skill_id, level")
      .eq("company_id", companyId);
    const existingMap = new Map(
      ((existingUs ?? []) as Array<{ user_id: string; skill_id: string; level: number }>).map((r) => [
        `${r.user_id}|${r.skill_id}`,
        Number(r.level) || 0
      ])
    );

    const toInsert: Array<{ company_id: string; user_id: string; skill_id: string; level: number }> = [];
    const toUpdate: Array<{ user_id: string; skill_id: string; level: number }> = [];

    for (const row of userSkillPlanned) {
      const key = `${row.userId}|${row.skillId}`;
      const prev = existingMap.get(key);
      if (prev === undefined) {
        toInsert.push({
          company_id: companyId,
          user_id: row.userId,
          skill_id: row.skillId,
          level: row.level
        });
      } else if (overwriteUserSkills && prev !== row.level) {
        toUpdate.push({ user_id: row.userId, skill_id: row.skillId, level: row.level });
      }
    }

    if (toInsert.length > 0) {
      const { error: insErr } = await sb.from("hr_user_skills").insert(toInsert);
      if (insErr) {
        throw new BadRequestException(`Insert user skills: ${insErr.message}`);
      }
      report.userSkillsInserted = toInsert.length;
    }

    for (const row of toUpdate) {
      const { error: updErr } = await sb
        .from("hr_user_skills")
        .update({ level: row.level, updated_at: new Date().toISOString() })
        .eq("company_id", companyId)
        .eq("user_id", row.user_id)
        .eq("skill_id", row.skill_id);
      if (updErr) {
        warnings.push(`Update user skill ${row.user_id}: ${updErr.message}`);
      } else {
        report.userSkillsUpdated += 1;
      }
    }
  }

  report.applied = apply;
  report.dryRun = false;
  return report;
}
