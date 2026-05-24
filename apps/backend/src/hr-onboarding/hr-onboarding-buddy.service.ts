import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@payday/domain";
import { HrDataStore } from "../platform/hr-data.store";

export type BuddySuggestionDto = {
  userId: string;
  fullName: string;
  email: string;
  score: number;
  reason: string;
  age?: number | null;
  teamId?: string | null;
  costCenterId?: string | null;
};

@Injectable()
export class HrOnboardingBuddyService {
  constructor(private readonly store: HrDataStore) {}

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

  async suggestBuddies(newHireUserId: string, actorUserId: string): Promise<{ items: BuddySuggestionDto[] }> {
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

    const ranked = companyUsers
      .map((u) => {
        const { score, reason } = this.scoreCandidate(newHire, u, buddyLoad.get(u.id) ?? 0);
        return {
          userId: u.id,
          fullName: u.fullName,
          email: u.email,
          score,
          reason,
          age: this.ageFromBirthDate(u.birthDate),
          teamId: u.teamId ?? null,
          costCenterId: u.costCenterId ?? null
        };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    return { items: ranked.slice(0, 5) };
  }

  async confirmBuddy(input: {
    newHireUserId: string;
    buddyUserId: string;
    actorUserId: string;
    matchScore?: number;
    matchReason?: string;
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

  async getAssignment(newHireUserId: string): Promise<{
    buddyUserId: string | null;
    buddyFullName: string | null;
    status: string | null;
    matchReason: string | null;
  }> {
    const sb = this.sb();
    if (!sb) return { buddyUserId: null, buddyFullName: null, status: null, matchReason: null };
    const { data } = await sb
      .from("onboarding_buddy_assignments")
      .select("buddy_user_id, status, match_reason")
      .eq("new_hire_user_id", newHireUserId)
      .maybeSingle();
    if (!data) return { buddyUserId: null, buddyFullName: null, status: null, matchReason: null };
    const buddyId = String((data as { buddy_user_id?: string }).buddy_user_id ?? "");
    const buddy = buddyId ? await this.store.getUser(buddyId) : null;
    return {
      buddyUserId: buddyId || null,
      buddyFullName: buddy?.fullName ?? null,
      status: String((data as { status?: string }).status ?? ""),
      matchReason: String((data as { match_reason?: string }).match_reason ?? "") || null
    };
  }
}
