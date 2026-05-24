import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@payday/domain";
import { AiAuditService } from "../ai-hr/ai-audit.service";
import { AiOpenAiRefinementService } from "../ai-hr/ai-openai-refinement.service";
import { AiPrivacyGateway } from "../ai-privacy/ai-privacy-gateway.service";
import { HrDataStore } from "../platform/hr-data.store";

const BUDDY_AI_SCHEMA = "ai_onboarding_buddy_match_v1";

export type BuddySuggestionDto = {
  userId: string;
  fullName: string;
  email: string;
  score: number;
  reason: string;
  ruleScore: number;
  ruleReason: string;
  aiRationale: string | null;
  age?: number | null;
  teamId?: string | null;
  costCenterId?: string | null;
};

export type BuddyAssignmentDto = {
  buddyUserId: string | null;
  buddyFullName: string | null;
  buddyEmail: string | null;
  status: string | null;
  matchReason: string | null;
  aiRationale: string | null;
  matchScore: number | null;
  keyContact: boolean;
  expiresAt: string | null;
  active: boolean;
};

type RuleRanked = BuddySuggestionDto & { candidateRef: string };

@Injectable()
export class HrOnboardingBuddyService {
  constructor(
    private readonly store: HrDataStore,
    private readonly gateway: AiPrivacyGateway,
    private readonly openAi: AiOpenAiRefinementService,
    private readonly audit: AiAuditService
  ) {}

  private sb(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  private ageFromBirthDate(birthDate?: string): number | null {
    if (!birthDate?.trim()) return null;
    const b = new Date(`${birthDate.trim()}T12:00:00.000Z`);
    if (Number.isNaN(b.getTime())) return null;
    const now = new Date();
    let age = now.getUTCFullYear() - b.getUTCFullYear();
    const md = now.getUTCMonth() - b.getUTCMonth();
    if (md < 0 || (md === 0 && now.getUTCDate() < b.getUTCDate())) age -= 1;
    return Math.max(18, Math.min(75, age));
  }

  private isAssignmentActive(row: {
    status?: string;
    expires_at?: string | null;
    key_contact?: boolean;
  }): boolean {
    if (String(row.status ?? "") !== "confirmed") return false;
    const expiresAt = row.expires_at;
    if (!expiresAt) return true;
    const exp = new Date(expiresAt);
    return !Number.isNaN(exp.getTime()) && exp.getTime() > Date.now();
  }

  private scoreCandidate(newHire: User, candidate: User, buddyLoad: number): { score: number; reason: string } {
    if (candidate.id === newHire.id) return { score: -1, reason: "" };
    if (candidate.employmentState === "offboarding") return { score: -1, reason: "" };

    let score = 40;
    const reasons: string[] = [];

    const hireAge = this.ageFromBirthDate(newHire.birthDate);
    const buddyAge = this.ageFromBirthDate(candidate.birthDate);
    if (hireAge != null && buddyAge != null) {
      const diff = Math.abs(hireAge - buddyAge);
      if (diff <= 5) {
        score += 25;
        reasons.push("fascia d'età simile");
      } else if (diff <= 12) {
        score += 15;
        reasons.push("età compatibile");
      } else if (diff <= 20) {
        score += 5;
      }
    }

    if (newHire.teamId && candidate.teamId && newHire.teamId === candidate.teamId) {
      score += 20;
      reasons.push("stesso team");
    } else if (newHire.costCenterId && candidate.costCenterId && newHire.costCenterId === candidate.costCenterId) {
      score += 12;
      reasons.push("stesso centro di costo");
    }

    if (newHire.managerId && candidate.managerId && newHire.managerId === candidate.managerId) {
      score += 8;
      reasons.push("stesso manager");
    }

    const hireYear = newHire.hireDate ? Number(newHire.hireDate.slice(0, 4)) : null;
    const buddyHireYear = candidate.hireDate ? Number(candidate.hireDate.slice(0, 4)) : null;
    if (hireYear && buddyHireYear && buddyHireYear <= hireYear - 1) {
      score += 10;
      reasons.push("esperienza aziendale");
    }

    if (buddyLoad === 0) {
      score += 8;
      reasons.push("disponibilità buddy");
    } else if (buddyLoad === 1) {
      score += 3;
    } else {
      score -= buddyLoad * 4;
      reasons.push("carico buddy moderato");
    }

    const reason =
      reasons.length > 0 ? reasons.slice(0, 3).join(", ") : "Profilo compatibile per onboarding";
    return { score: Math.round(score * 10) / 10, reason };
  }

  private async enrichWithAi(
    newHire: User,
    ranked: RuleRanked[],
    actorUserId: string
  ): Promise<{ items: BuddySuggestionDto[]; llm: { active: boolean; refineApplied: boolean } }> {
    const llmInactive = { active: this.openAi.isActive(), refineApplied: false };
    if (ranked.length === 0) {
      return { items: [], llm: { active: llmInactive.active, refineApplied: false } };
    }

    const hireAge = this.ageFromBirthDate(newHire.birthDate);
    const facts = {
      newHire: {
        age: hireAge,
        hasTeam: Boolean(newHire.teamId),
        hasCostCenter: Boolean(newHire.costCenterId),
        hireYear: newHire.hireDate ? Number(newHire.hireDate.slice(0, 4)) : null,
        employmentState: newHire.employmentState ?? "active"
      },
      candidates: ranked.map((c) => ({
        candidateRef: c.candidateRef,
        ruleScore: c.ruleScore,
        ruleReason: c.ruleReason,
        age: c.age ?? null,
        sameTeam: Boolean(newHire.teamId && c.teamId && newHire.teamId === c.teamId),
        sameCostCenter: Boolean(
          newHire.costCenterId && c.costCenterId && newHire.costCenterId === c.costCenterId
        )
      }))
    };

    const sessionId = (await this.gateway.beginSession(newHire.companyId, actorUserId)).sessionId;
    let refineApplied = false;
    try {
      const wrapped = {
        envelope: {
          seed:
            "Valuta i candidati buddy per una nuova assunzione: affinità generazionale, team, carico buddy, esperienza. Restituisci ranking con punteggio AI 0-100 e rationale breve in italiano.",
          facts
        }
      };
      const pseudo = await this.gateway.toModelPayload(sessionId, wrapped, BUDDY_AI_SCHEMA);
      let modelJson: unknown = pseudo.pseudonymized;
      if (this.openAi.isActive()) {
        const refined = await this.openAi.refinePseudonymizedJson(pseudo.pseudonymized, BUDDY_AI_SCHEMA);
        if (refined.ok) {
          modelJson = refined.data;
          refineApplied = true;
        }
      }
      const cleared = await this.gateway.fromModelResponse(sessionId, modelJson);
      const env = (cleared as { envelope?: Record<string, unknown> })?.envelope;
      const rankings = Array.isArray(env?.rankings) ? (env!.rankings as unknown[]) : [];
      const byRef = new Map<string, { aiScore: number; aiRationale: string }>();
      for (const row of rankings) {
        const o = row as Record<string, unknown>;
        const ref = String(o.candidateRef ?? "");
        if (!ref) continue;
        const aiScore = typeof o.aiScore === "number" ? o.aiScore : Number(o.aiScore);
        const aiRationale = typeof o.aiRationale === "string" ? o.aiRationale.trim() : "";
        if (!Number.isFinite(aiScore)) continue;
        byRef.set(ref, {
          aiScore: Math.max(0, Math.min(100, aiScore)),
          aiRationale: aiRationale.slice(0, 400)
        });
      }

      const merged = ranked.map((c) => {
        const ai = byRef.get(c.candidateRef);
        const aiScore = ai?.aiScore ?? null;
        const combined =
          aiScore != null
            ? Math.round((c.ruleScore * 0.55 + aiScore * 0.45) * 10) / 10
            : c.ruleScore;
        const aiRationale = ai?.aiRationale || null;
        const reasonParts = [c.ruleReason];
        if (aiRationale) reasonParts.push(aiRationale);
        return {
          userId: c.userId,
          fullName: c.fullName,
          email: c.email,
          score: combined,
          reason: reasonParts.filter(Boolean).join(" · "),
          ruleScore: c.ruleScore,
          ruleReason: c.ruleReason,
          aiRationale,
          age: c.age,
          teamId: c.teamId,
          costCenterId: c.costCenterId
        };
      });

      merged.sort((a, b) => b.score - a.score);

      await this.audit.append({
        companyId: newHire.companyId,
        userId: actorUserId,
        roleSnapshot: "hr",
        feature: "onboarding_buddy_match",
        schemaVersion: BUDDY_AI_SCHEMA,
        sessionId,
        inputForFingerprint: { candidateCount: ranked.length },
        outcome: refineApplied ? "refined" : "offline_or_fallback"
      });

      return { items: merged.slice(0, 5), llm: { active: llmInactive.active, refineApplied } };
    } catch {
      return {
        items: ranked.map(({ candidateRef: _c, ...rest }) => ({
          ...rest,
          score: rest.ruleScore,
          reason: rest.ruleReason,
          aiRationale: null
        })),
        llm: { active: llmInactive.active, refineApplied: false }
      };
    }
  }

  async suggestBuddies(
    newHireUserId: string,
    actorUserId: string
  ): Promise<{ items: BuddySuggestionDto[]; llm: { active: boolean; refineApplied: boolean } }> {
    const newHire = await this.store.getUser(newHireUserId);
    if (!newHire) throw new NotFoundException("Nuova assunzione non trovata");
    const actor = await this.store.getUser(actorUserId);
    if (!actor || actor.companyId !== newHire.companyId) {
      throw new BadRequestException("Permesso negato");
    }

    const all = await this.store.listUsers();
    const companyUsers = all.filter(
      (u) => u.companyId === newHire.companyId && u.id !== newHire.id && u.employmentState !== "offboarding"
    );

    const sb = this.sb();
    const buddyLoad = new Map<string, number>();
    if (sb) {
      const { data } = await sb
        .from("onboarding_buddy_assignments")
        .select("buddy_user_id")
        .eq("company_id", newHire.companyId)
        .in("status", ["confirmed", "suggested"]);
      for (const row of (data as { buddy_user_id?: string }[]) ?? []) {
        const id = String(row.buddy_user_id ?? "");
        if (id) buddyLoad.set(id, (buddyLoad.get(id) ?? 0) + 1);
      }
    }

    const ranked: RuleRanked[] = companyUsers
      .map((u, idx) => {
        const { score, reason } = this.scoreCandidate(newHire, u, buddyLoad.get(u.id) ?? 0);
        return {
          candidateRef: `c${idx}`,
          userId: u.id,
          fullName: u.fullName,
          email: u.email,
          score,
          reason,
          ruleScore: score,
          ruleReason: reason,
          aiRationale: null as string | null,
          age: this.ageFromBirthDate(u.birthDate),
          teamId: u.teamId ?? null,
          costCenterId: u.costCenterId ?? null
        };
      })
      .filter((x) => x.ruleScore > 0)
      .sort((a, b) => b.ruleScore - a.ruleScore)
      .slice(0, 8)
      .map((c, i) => ({ ...c, candidateRef: `c${i}` }));

    return this.enrichWithAi(newHire, ranked, actorUserId);
  }

  async confirmBuddy(input: {
    newHireUserId: string;
    buddyUserId: string;
    actorUserId: string;
    matchScore?: number;
    matchReason?: string;
    aiRationale?: string;
    keyContact?: boolean;
    expiresAt?: string | null;
  }): Promise<{ ok: true; buddyUserId: string; buddyFullName: string }> {
    const newHire = await this.store.getUser(input.newHireUserId);
    const buddy = await this.store.getUser(input.buddyUserId);
    if (!newHire || !buddy) throw new NotFoundException("Utente non trovato");
    if (newHire.companyId !== buddy.companyId) {
      throw new BadRequestException("Buddy deve appartenere alla stessa azienda");
    }
    if (input.newHireUserId === input.buddyUserId) {
      throw new BadRequestException("Il buddy non può coincidere con la nuova assunzione");
    }

    const now = new Date().toISOString();
    const sb = this.sb();
    if (sb) {
      const { error } = await sb.from("onboarding_buddy_assignments").upsert(
        {
          new_hire_user_id: input.newHireUserId,
          company_id: newHire.companyId,
          buddy_user_id: input.buddyUserId,
          status: "confirmed",
          match_score: input.matchScore ?? null,
          match_reason: input.matchReason?.trim() || "",
          ai_rationale: input.aiRationale?.trim() || "",
          key_contact: input.keyContact !== false,
          expires_at: input.expiresAt?.trim() ? input.expiresAt.trim() : null,
          confirmed_by_user_id: input.actorUserId,
          confirmed_at: now,
          updated_at: now
        },
        { onConflict: "new_hire_user_id" }
      );
      if (error) throw new BadRequestException(`Assegnazione buddy: ${error.message}`);
    }

    await this.store.notifyUserInApp({
      userId: input.buddyUserId,
      title: "Sei buddy di onboarding",
      body: `HR ti ha assegnato come buddy per ${newHire.fullName}.`,
      kind: "onboarding_buddy",
      actionPath: "/il-mio-team"
    });
    await this.store.notifyUserInApp({
      userId: input.newHireUserId,
      title: "Buddy onboarding assegnato",
      body: `${buddy.fullName} è il tuo buddy di onboarding.`,
      kind: "onboarding_buddy",
      actionPath: "/il-mio-team"
    });

    return { ok: true, buddyUserId: buddy.id, buddyFullName: buddy.fullName };
  }

  async getAssignment(newHireUserId: string): Promise<BuddyAssignmentDto> {
    const empty: BuddyAssignmentDto = {
      buddyUserId: null,
      buddyFullName: null,
      buddyEmail: null,
      status: null,
      matchReason: null,
      aiRationale: null,
      matchScore: null,
      keyContact: true,
      expiresAt: null,
      active: false
    };
    const sb = this.sb();
    if (!sb) return empty;
    const { data } = await sb
      .from("onboarding_buddy_assignments")
      .select(
        "buddy_user_id, status, match_reason, ai_rationale, match_score, key_contact, expires_at"
      )
      .eq("new_hire_user_id", newHireUserId)
      .maybeSingle();
    if (!data) return empty;
    const row = data as {
      buddy_user_id?: string;
      status?: string;
      match_reason?: string;
      ai_rationale?: string;
      match_score?: number | null;
      key_contact?: boolean;
      expires_at?: string | null;
    };
    const buddyId = String(row.buddy_user_id ?? "");
    const buddy = buddyId ? await this.store.getUser(buddyId) : null;
    const active = this.isAssignmentActive(row);
    return {
      buddyUserId: buddyId || null,
      buddyFullName: buddy?.fullName ?? null,
      buddyEmail: buddy?.email ?? null,
      status: String(row.status ?? ""),
      matchReason: String(row.match_reason ?? "") || null,
      aiRationale: String(row.ai_rationale ?? "") || null,
      matchScore: row.match_score != null ? Number(row.match_score) : null,
      keyContact: row.key_contact !== false,
      expiresAt: row.expires_at ?? null,
      active
    };
  }

  async getActiveBuddyForEmployee(userId: string): Promise<{
    id: string;
    fullName: string;
    email: string;
    matchReason: string | null;
    aiRationale: string | null;
  } | null> {
    const assignment = await this.getAssignment(userId);
    if (!assignment.active || !assignment.keyContact || !assignment.buddyUserId || !assignment.buddyFullName) {
      return null;
    }
    return {
      id: assignment.buddyUserId,
      fullName: assignment.buddyFullName,
      email: assignment.buddyEmail ?? "",
      matchReason: assignment.matchReason,
      aiRationale: assignment.aiRationale
    };
  }
}
