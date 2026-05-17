import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { HrDataStore } from "../platform/hr-data.store";
import { RecruitingService } from "../recruiting/recruiting.service";
import { TrainingService } from "../training/training.service";
import {
  HR_ONBOARDING_WIZARD_STEP_COUNT,
  HR_ONBOARDING_WIZARD_STEPS,
  type HrOnboardingWizardStepKey
} from "./hr-onboarding.constants";

export type WizardStepPayload = Record<string, unknown>;

export interface HrOnboardingWizardDto {
  userId: string;
  companyId: string;
  recruitCandidateId: string | null;
  currentStepIndex: number;
  steps: Record<string, { done: boolean; data: WizardStepPayload; savedAt?: string }>;
  completedAt: string | null;
  updatedAt: string;
  stepDefinitions: typeof HR_ONBOARDING_WIZARD_STEPS;
}

@Injectable()
export class HrOnboardingService {
  private readonly memWizard = new Map<string, HrOnboardingWizardDto>();

  constructor(
    private readonly store: HrDataStore,
    private readonly recruiting: RecruitingService,
    private readonly training: TrainingService
  ) {}

  private sb(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return null;
    }
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  private emptySteps(): HrOnboardingWizardDto["steps"] {
    const steps: HrOnboardingWizardDto["steps"] = {};
    for (const s of HR_ONBOARDING_WIZARD_STEPS) {
      steps[s.key] = { done: false, data: {} };
    }
    return steps;
  }

  private mapRow(row: Record<string, unknown>): HrOnboardingWizardDto {
    const rawSteps = row.steps_json;
    const steps =
      rawSteps && typeof rawSteps === "object" && !Array.isArray(rawSteps)
        ? (rawSteps as HrOnboardingWizardDto["steps"])
        : this.emptySteps();
    for (const s of HR_ONBOARDING_WIZARD_STEPS) {
      if (!steps[s.key]) {
        steps[s.key] = { done: false, data: {} };
      }
    }
    return {
      userId: String(row.user_id),
      companyId: String(row.company_id),
      recruitCandidateId: row.recruit_candidate_id != null ? String(row.recruit_candidate_id) : null,
      currentStepIndex: Number(row.current_step_index ?? 0),
      steps,
      completedAt: row.completed_at != null ? String(row.completed_at) : null,
      updatedAt: String(row.updated_at ?? new Date().toISOString()),
      stepDefinitions: HR_ONBOARDING_WIZARD_STEPS
    };
  }

  async getWizard(userId: string): Promise<HrOnboardingWizardDto> {
    const sb = this.sb();
    if (!sb) {
      const mem = this.memWizard.get(userId);
      if (!mem) {
        throw new NotFoundException("Wizard onboarding non trovato");
      }
      return mem;
    }
    const { data, error } = await sb.from("hr_onboarding_wizard").select("*").eq("user_id", userId).maybeSingle();
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new NotFoundException("Wizard onboarding non trovato");
    }
    return this.mapRow(data as Record<string, unknown>);
  }

  async startFromCandidate(input: {
    companyId: string;
    candidateId: string;
    actorUserId: string;
    roleId?: string;
    costCenterId?: string;
    contractType?: string;
    hireDate?: string;
    managerId?: string;
  }): Promise<{ user: { id: string; fullName: string; email: string }; wizard: HrOnboardingWizardDto }> {
    const candidate = await this.recruiting.assertCandidateInCompany(input.candidateId, input.companyId);
    const sb = this.sb();

    if (sb) {
      const { data: existing } = await sb
        .from("users")
        .select("id, fullName, email")
        .eq("recruit_candidate_id", input.candidateId)
        .maybeSingle();
      if (existing) {
        const wizard = await this.getWizard(String(existing.id));
        return {
          user: {
            id: String(existing.id),
            fullName: String((existing as { fullName?: string }).fullName ?? ""),
            email: String((existing as { email?: string }).email ?? "")
          },
          wizard
        };
      }
    }

    const roles = await this.store.listRoles();
    const costCenters = await this.store.listCostCenters();
    const roleId = input.roleId?.trim() || roles.find((r) => r.name.toLowerCase().includes("dipendent"))?.id || roles[0]?.id;
    const costCenterId = input.costCenterId?.trim() || costCenters[0]?.id;
    if (!roleId || !costCenterId) {
      throw new BadRequestException("Configura almeno un ruolo Nexa e un centro di costo prima di avviare l'onboarding.");
    }

    const hireDate = input.hireDate?.trim() || new Date().toISOString().slice(0, 10);
    const user = await this.store.createUser(
      {
        firstName: candidate.first_name,
        lastName: candidate.last_name,
        email: candidate.email ?? undefined,
        phone: candidate.phone ?? undefined,
        role: "user",
        companyId: input.companyId,
        roleId,
        costCenterId,
        managerId: input.managerId,
        contractType: input.contractType?.trim() || "Tempo indeterminato",
        weeklyContractHours: 40,
        hireDate,
        employmentState: "hr_onboarding",
        vacationAllowanceDays: 22,
        jurisdiction: "IT"
      },
      { skipTeamLeadLinkValidation: true }
    );

    if (sb) {
      await sb
        .from("users")
        .update({ recruit_candidate_id: input.candidateId })
        .eq("id", user.id);
    }

    const prefilled: HrOnboardingWizardDto["steps"] = this.emptySteps();
    prefilled.anagrafica_contratto = {
      done: false,
      data: {
        firstName: candidate.first_name,
        lastName: candidate.last_name,
        email: candidate.email ?? "",
        phone: candidate.phone ?? "",
        hireDate,
        contractType: input.contractType?.trim() || "Tempo indeterminato",
        fromCandidateId: input.candidateId
      }
    };

    const wizard = await this.createWizardRow({
      userId: user.id,
      companyId: input.companyId,
      recruitCandidateId: input.candidateId,
      actorUserId: input.actorUserId,
      steps: prefilled
    });

    await this.store.getOrCreateOnboarding(user.id);

    return {
      user: { id: user.id, fullName: user.fullName, email: user.email },
      wizard
    };
  }

  private async createWizardRow(input: {
    userId: string;
    companyId: string;
    recruitCandidateId: string | null;
    actorUserId: string;
    steps: HrOnboardingWizardDto["steps"];
  }): Promise<HrOnboardingWizardDto> {
    const now = new Date().toISOString();
    const sb = this.sb();
    if (!sb) {
      const dto: HrOnboardingWizardDto = {
        userId: input.userId,
        companyId: input.companyId,
        recruitCandidateId: input.recruitCandidateId,
        currentStepIndex: 0,
        steps: input.steps,
        completedAt: null,
        updatedAt: now,
        stepDefinitions: HR_ONBOARDING_WIZARD_STEPS
      };
      this.memWizard.set(input.userId, dto);
      return dto;
    }
    const { data, error } = await sb
      .from("hr_onboarding_wizard")
      .insert({
        user_id: input.userId,
        company_id: input.companyId,
        recruit_candidate_id: input.recruitCandidateId,
        current_step_index: 0,
        steps_json: input.steps,
        updated_at: now,
        updated_by_user_id: input.actorUserId
      })
      .select("*")
      .single();
    if (error || !data) {
      throw new InternalServerErrorException(`Creazione wizard onboarding: ${error?.message ?? "nessun dato"}`);
    }
    return this.mapRow(data as Record<string, unknown>);
  }

  async saveStep(input: {
    userId: string;
    stepKey: HrOnboardingWizardStepKey;
    data: WizardStepPayload;
    markDone: boolean;
    actorUserId: string;
  }): Promise<HrOnboardingWizardDto> {
    const idx = HR_ONBOARDING_WIZARD_STEPS.findIndex((s) => s.key === input.stepKey);
    if (idx < 0) {
      throw new BadRequestException("Passo wizard non valido");
    }

    const wizard = await this.getWizard(input.userId);
    const steps = { ...wizard.steps };
    steps[input.stepKey] = {
      done: input.markDone,
      data: input.data,
      savedAt: new Date().toISOString()
    };

    if (input.stepKey === "anagrafica_contratto" && input.markDone) {
      await this.applyAnagraficaToUser(input.userId, input.data);
    }

    if (input.stepKey === "buddy_formazione" && input.markDone) {
      await this.applyTrainingAssignments(input.userId, wizard.companyId, input.data, input.actorUserId);
    }

    const nextIndex = input.markDone ? Math.min(idx + 1, HR_ONBOARDING_WIZARD_STEP_COUNT - 1) : idx;
    const allDone = HR_ONBOARDING_WIZARD_STEPS.every((s) => steps[s.key]?.done === true);
    const completedAt = allDone ? new Date().toISOString() : null;
    const now = new Date().toISOString();

    const sb = this.sb();
    if (!sb) {
      const updated: HrOnboardingWizardDto = {
        ...wizard,
        steps,
        currentStepIndex: nextIndex,
        completedAt,
        updatedAt: now
      };
      this.memWizard.set(input.userId, updated);
      if (allDone) {
        await this.store.updateUser(input.userId, { employmentState: "active" });
        await this.training.ensureNexaPlatformCourseAssigned({
          companyId: wizard.companyId,
          userId: input.userId,
          assignedBy: input.actorUserId
        });
      }
      return updated;
    }

    const { data, error } = await sb
      .from("hr_onboarding_wizard")
      .update({
        steps_json: steps,
        current_step_index: nextIndex,
        completed_at: completedAt,
        updated_at: now,
        updated_by_user_id: input.actorUserId
      })
      .eq("user_id", input.userId)
      .select("*")
      .single();
    if (error || !data) {
      throw new InternalServerErrorException(`Salvataggio passo onboarding: ${error?.message ?? "nessun dato"}`);
    }
    if (allDone) {
      await this.store.updateUser(input.userId, { employmentState: "active" });
      await this.training.ensureNexaPlatformCourseAssigned({
        companyId: wizard.companyId,
        userId: input.userId,
        assignedBy: input.actorUserId
      });
    }
    return this.mapRow(data as Record<string, unknown>);
  }

  private async applyAnagraficaToUser(userId: string, data: WizardStepPayload): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (typeof data.firstName === "string" && data.firstName.trim()) {
      patch.firstName = data.firstName.trim();
    }
    if (typeof data.lastName === "string" && data.lastName.trim()) {
      patch.lastName = data.lastName.trim();
    }
    if (typeof data.email === "string" && data.email.trim()) {
      patch.email = data.email.trim();
    }
    if (typeof data.phone === "string") {
      patch.phone = data.phone.trim();
    }
    if (typeof data.hireDate === "string" && data.hireDate.trim()) {
      patch.hireDate = data.hireDate.trim();
    }
    if (typeof data.contractType === "string" && data.contractType.trim()) {
      patch.contractType = data.contractType.trim();
    }
    if (typeof data.fiscalCode === "string" && data.fiscalCode.trim()) {
      patch.fiscalCode = data.fiscalCode.trim();
    }
    if (Object.keys(patch).length > 0) {
      await this.store.updateUser(userId, patch);
    }
  }

  private async applyTrainingAssignments(
    userId: string,
    companyId: string,
    data: WizardStepPayload,
    actorUserId: string
  ): Promise<void> {
    const courseIds = Array.isArray(data.courseIds)
      ? (data.courseIds as unknown[]).map((x) => String(x)).filter(Boolean)
      : [];
    const dueDate =
      typeof data.trainingDueDate === "string" && data.trainingDueDate.trim()
        ? data.trainingDueDate.trim()
        : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    if (courseIds.length === 0) {
      const mandatory = await this.training.listCourses(companyId, { category: "mandatory" });
      for (const c of mandatory) {
        await this.training.assignCourse({
          companyId,
          userId,
          courseId: c.id,
          dueDate,
          assignedBy: actorUserId
        });
      }
    } else {
      for (const courseId of courseIds) {
        await this.training.assignCourse({
          companyId,
          userId,
          courseId,
          dueDate,
          assignedBy: actorUserId
        });
      }
    }
    await this.training.ensureNexaPlatformCourseAssigned({
      companyId,
      userId,
      dueDate,
      assignedBy: actorUserId
    });
  }

  async linkExistingUser(input: {
    userId: string;
    candidateId: string;
    companyId: string;
    actorUserId: string;
  }): Promise<HrOnboardingWizardDto> {
    await this.recruiting.assertCandidateInCompany(input.candidateId, input.companyId);
    const user = await this.store.getUser(input.userId);
    if (!user || user.companyId !== input.companyId) {
      throw new NotFoundException("Dipendente non trovato");
    }
    await this.store.updateUser(input.userId, { employmentState: "hr_onboarding" });
    const sb = this.sb();
    if (sb) {
      await sb.from("users").update({ recruit_candidate_id: input.candidateId }).eq("id", input.userId);
      const { data: existing } = await sb.from("hr_onboarding_wizard").select("user_id").eq("user_id", input.userId).maybeSingle();
      if (existing) {
        return this.getWizard(input.userId);
      }
    } else if (this.memWizard.has(input.userId)) {
      return this.getWizard(input.userId);
    }
    const candidate = await this.recruiting.getCandidate(input.candidateId);
    const steps = this.emptySteps();
    steps.anagrafica_contratto = {
      done: false,
      data: {
        firstName: candidate.first_name,
        lastName: candidate.last_name,
        email: candidate.email ?? user.email,
        phone: candidate.phone ?? user.phone ?? ""
      }
    };
    return this.createWizardRow({
      userId: input.userId,
      companyId: input.companyId,
      recruitCandidateId: input.candidateId,
      actorUserId: input.actorUserId,
      steps
    });
  }
}
