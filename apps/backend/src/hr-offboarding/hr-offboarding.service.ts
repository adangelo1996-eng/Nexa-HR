import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException
} from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { OnboardingStatus } from "@payday/domain";
import { HrDataStore } from "../platform/hr-data.store";
import {
  EMPLOYEE_OFFBOARDING_CHECKLIST,
  HR_OFFBOARDING_WIZARD_STEP_COUNT,
  HR_OFFBOARDING_WIZARD_STEPS,
  type HrOffboardingWizardStepKey
} from "./hr-offboarding.constants";

export type OffboardWizardStepPayload = Record<string, unknown>;

export interface HrOffboardingWizardDto {
  userId: string;
  companyId: string;
  currentStepIndex: number;
  steps: Record<string, { done: boolean; data: OffboardWizardStepPayload; savedAt?: string }>;
  cancelledAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  stepDefinitions: typeof HR_OFFBOARDING_WIZARD_STEPS;
  prefilled?: {
    noticePeriodMonths: number | null;
    noticePeriodSource: "user" | "contract" | "manual" | null;
    signedContractDocumentId: string | null;
    signedContractTitle: string | null;
  };
}

@Injectable()
export class HrOffboardingService {
  private readonly memWizard = new Map<string, HrOffboardingWizardDto>();

  constructor(private readonly store: HrDataStore) {}

  private sb(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return null;
    }
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  private emptySteps(): HrOffboardingWizardDto["steps"] {
    const steps: HrOffboardingWizardDto["steps"] = {};
    for (const s of HR_OFFBOARDING_WIZARD_STEPS) {
      steps[s.key] = { done: false, data: {} };
    }
    return steps;
  }

  private mapRow(row: Record<string, unknown>): HrOffboardingWizardDto {
    const rawSteps = row.steps_json;
    const steps =
      rawSteps && typeof rawSteps === "object" && !Array.isArray(rawSteps)
        ? (rawSteps as HrOffboardingWizardDto["steps"])
        : this.emptySteps();
    for (const s of HR_OFFBOARDING_WIZARD_STEPS) {
      if (!steps[s.key]) {
        steps[s.key] = { done: false, data: {} };
      }
    }
    return {
      userId: String(row.user_id),
      companyId: String(row.company_id),
      currentStepIndex: Number(row.current_step_index ?? 0),
      steps,
      cancelledAt: row.cancelled_at != null ? String(row.cancelled_at) : null,
      completedAt: row.completed_at != null ? String(row.completed_at) : null,
      updatedAt: String(row.updated_at ?? new Date().toISOString()),
      stepDefinitions: HR_OFFBOARDING_WIZARD_STEPS
    };
  }

  private async resolveContractContext(userId: string): Promise<{
    noticePeriodMonths: number | null;
    noticePeriodSource: "user" | "contract" | "manual" | null;
    signedContractDocumentId: string | null;
    signedContractTitle: string | null;
  }> {
    const user = await this.store.getUser(userId);
    const rawNotice =
      (user as { noticePeriodMonths?: number | null }).noticePeriodMonths ??
      (user as { notice_period_months?: number | null }).notice_period_months;
    if (rawNotice != null && Number.isFinite(Number(rawNotice))) {
      return {
        noticePeriodMonths: Number(rawNotice),
        noticePeriodSource: "user",
        signedContractDocumentId: null,
        signedContractTitle: null
      };
    }

    const sb = this.sb();
    if (!sb) {
      return {
        noticePeriodMonths: null,
        noticePeriodSource: null,
        signedContractDocumentId: null,
        signedContractTitle: null
      };
    }

    const { data: stdContract } = await sb
      .from("hr_standard_contracts")
      .select("id, signed_scan_document_id, party")
      .eq("signed_by_user_id", userId)
      .not("signed_scan_document_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let signedContractDocumentId: string | null = null;
    let signedContractTitle: string | null = null;
    let noticeFromContract: number | null = null;

    if (stdContract) {
      signedContractDocumentId = stdContract.signed_scan_document_id
        ? String(stdContract.signed_scan_document_id)
        : null;
      signedContractTitle = "Contratto standard firmato";
      const party = stdContract.party;
      if (party && typeof party === "object" && !Array.isArray(party)) {
        const p = party as Record<string, unknown>;
        const candidates = [p.noticePeriodMonths, p.notice_period_months, p.preavvisoMesi, p.preavviso_mesi];
        for (const c of candidates) {
          const n = Number(c);
          if (Number.isFinite(n) && n >= 0) {
            noticeFromContract = n;
            break;
          }
        }
      }
    }

    if (!signedContractDocumentId) {
      const { data: vaultDoc } = await sb
        .from("employee_documents")
        .select("id, title")
        .eq("userId", userId)
        .eq("kind", "contract")
        .order("createdAt", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (vaultDoc) {
        signedContractDocumentId = String(vaultDoc.id);
        signedContractTitle = String(vaultDoc.title ?? "Contratto firmato");
      }
    }

    if (noticeFromContract != null) {
      return {
        noticePeriodMonths: noticeFromContract,
        noticePeriodSource: "contract",
        signedContractDocumentId,
        signedContractTitle
      };
    }

    return {
      noticePeriodMonths: null,
      noticePeriodSource: null,
      signedContractDocumentId,
      signedContractTitle
    };
  }

  async getWizard(userId: string): Promise<HrOffboardingWizardDto> {
    const sb = this.sb();
    if (!sb) {
      const mem = this.memWizard.get(userId);
      if (!mem) {
        throw new NotFoundException("Wizard offboarding non trovato");
      }
      return mem;
    }
    const { data, error } = await sb.from("hr_offboarding_wizard").select("*").eq("user_id", userId).maybeSingle();
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new NotFoundException("Wizard offboarding non trovato");
    }
    const dto = this.mapRow(data as Record<string, unknown>);
    dto.prefilled = await this.resolveContractContext(userId);
    return dto;
  }

  async startForEmployee(input: {
    userId: string;
    companyId: string;
    actorUserId: string;
  }): Promise<{ user: { id: string; fullName: string; email: string }; wizard: HrOffboardingWizardDto }> {
    const user = await this.store.getUser(input.userId);
    if (!user || user.companyId !== input.companyId) {
      throw new NotFoundException("Dipendente non trovato");
    }
    const state = user.employmentState ?? "active";
    if (state === "offboarding") {
      const wizard = await this.getWizard(input.userId);
      return {
        user: { id: user.id, fullName: user.fullName, email: user.email },
        wizard
      };
    }
    if (state !== "active") {
      throw new BadRequestException("Offboarding disponibile solo per dipendenti attivi.");
    }

    const sb = this.sb();
    if (sb) {
      const { data: existing } = await sb
        .from("hr_offboarding_wizard")
        .select("user_id, cancelled_at")
        .eq("user_id", input.userId)
        .maybeSingle();
      if (existing && existing.cancelled_at == null) {
        const wizard = await this.getWizard(input.userId);
        return {
          user: { id: user.id, fullName: user.fullName, email: user.email },
          wizard
        };
      }
    } else if (this.memWizard.has(input.userId)) {
      const mem = this.memWizard.get(input.userId)!;
      if (!mem.cancelledAt) {
        return {
          user: { id: user.id, fullName: user.fullName, email: user.email },
          wizard: mem
        };
      }
    }

    const prefilled = await this.resolveContractContext(input.userId);
    const steps = this.emptySteps();
    steps.avvio_preavviso = {
      done: false,
      data: {
        noticePeriodMonths: prefilled.noticePeriodMonths ?? "",
        noticePeriodSource: prefilled.noticePeriodSource ?? "manual",
        exitReason: "",
        communicationDate: new Date().toISOString().slice(0, 10),
        lastWorkingDay: ""
      }
    };
    steps.documenti_uscita = {
      done: false,
      data: {
        signedContractDocumentId: prefilled.signedContractDocumentId ?? "",
        signedContractTitle: prefilled.signedContractTitle ?? "",
        contractPdfRequired: !prefilled.signedContractDocumentId
      }
    };

    await this.store.updateUser(input.userId, { employmentState: "offboarding" });
    await this.store.getOrCreateOffboarding(input.userId);

    const wizard = await this.createWizardRow({
      userId: input.userId,
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      steps,
      prefilled
    });

    await this.store.notifyUserInApp({
      userId: input.userId,
      title: "Procedura di uscita avviata",
      body: "HR ha avviato l'offboarding. Consulta il percorso per i passi da completare prima dell'ultimo giorno lavorativo.",
      kind: "offboarding_started",
      actionPath: "/percorso"
    });

    return {
      user: { id: user.id, fullName: user.fullName, email: user.email },
      wizard
    };
  }

  private async createWizardRow(input: {
    userId: string;
    companyId: string;
    actorUserId: string;
    steps: HrOffboardingWizardDto["steps"];
    prefilled?: HrOffboardingWizardDto["prefilled"];
  }): Promise<HrOffboardingWizardDto> {
    const now = new Date().toISOString();
    const sb = this.sb();
    if (!sb) {
      const dto: HrOffboardingWizardDto = {
        userId: input.userId,
        companyId: input.companyId,
        currentStepIndex: 0,
        steps: input.steps,
        cancelledAt: null,
        completedAt: null,
        updatedAt: now,
        stepDefinitions: HR_OFFBOARDING_WIZARD_STEPS,
        prefilled: input.prefilled
      };
      this.memWizard.set(input.userId, dto);
      return dto;
    }
    const { data, error } = await sb
      .from("hr_offboarding_wizard")
      .insert({
        user_id: input.userId,
        company_id: input.companyId,
        current_step_index: 0,
        steps_json: input.steps,
        updated_at: now,
        updated_by_user_id: input.actorUserId
      })
      .select("*")
      .single();
    if (error || !data) {
      throw new InternalServerErrorException(`Creazione wizard offboarding: ${error?.message ?? "nessun dato"}`);
    }
    const dto = this.mapRow(data as Record<string, unknown>);
    dto.prefilled = input.prefilled;
    return dto;
  }

  async saveStep(input: {
    userId: string;
    stepKey: HrOffboardingWizardStepKey;
    data: OffboardWizardStepPayload;
    markDone: boolean;
    actorUserId: string;
  }): Promise<HrOffboardingWizardDto> {
    const idx = HR_OFFBOARDING_WIZARD_STEPS.findIndex((s) => s.key === input.stepKey);
    if (idx < 0) {
      throw new BadRequestException("Passo wizard non valido");
    }

    const wizard = await this.getWizard(input.userId);
    if (wizard.cancelledAt) {
      throw new BadRequestException("Wizard offboarding annullato");
    }
    if (wizard.completedAt) {
      throw new BadRequestException("Wizard offboarding già completato");
    }

    const steps = { ...wizard.steps };
    steps[input.stepKey] = {
      done: input.markDone,
      data: input.data,
      savedAt: new Date().toISOString()
    };

    if (input.stepKey === "avvio_preavviso" && input.markDone) {
      await this.applyAvvioPreavviso(input.userId, input.data);
    }

    const nextIndex = input.markDone ? Math.min(idx + 1, HR_OFFBOARDING_WIZARD_STEP_COUNT - 1) : idx;
    const allDone = HR_OFFBOARDING_WIZARD_STEPS.every((s) => steps[s.key]?.done === true);
    const completedAt = allDone ? new Date().toISOString() : null;
    const now = new Date().toISOString();

    if (allDone) {
      await this.finalizeOffboarding(input.userId, steps, input.actorUserId);
    }

    const sb = this.sb();
    if (!sb) {
      const updated: HrOffboardingWizardDto = {
        ...wizard,
        steps,
        currentStepIndex: nextIndex,
        completedAt,
        updatedAt: now
      };
      this.memWizard.set(input.userId, updated);
      return updated;
    }

    const { data, error } = await sb
      .from("hr_offboarding_wizard")
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
      throw new InternalServerErrorException(`Salvataggio passo offboarding: ${error?.message ?? "nessun dato"}`);
    }
    const dto = this.mapRow(data as Record<string, unknown>);
    dto.prefilled = wizard.prefilled;
    return dto;
  }

  private async applyAvvioPreavviso(userId: string, data: OffboardWizardStepPayload): Promise<void> {
    const patch: Record<string, unknown> = {};
    const notice = Number(data.noticePeriodMonths);
    if (Number.isFinite(notice) && notice >= 0) {
      patch.noticePeriodMonths = notice;
    }
    if (typeof data.lastWorkingDay === "string" && data.lastWorkingDay.trim()) {
      patch.contractEndDate = data.lastWorkingDay.trim();
    }
    if (Object.keys(patch).length > 0) {
      await this.store.updateUser(userId, patch);
    }
  }

  private buildLifecycleChecklist(steps: HrOffboardingWizardDto["steps"]): Record<string, boolean> {
    return {
      revoca_accessi: Boolean(steps.revoca_accessi_it?.done),
      payroll_finale: Boolean(steps.cedolino_finale?.done),
      hardware: Boolean(steps.documenti_uscita?.data?.assetsReturned),
      badge_revocato: Boolean(steps.badge_fisico?.done),
      formazione_chiusa: Boolean(steps.formazione_chiusura?.done),
      exit_interview: Boolean(steps.exit_interview?.done)
    };
  }

  private async finalizeOffboarding(
    userId: string,
    steps: HrOffboardingWizardDto["steps"],
    actorUserId: string
  ): Promise<void> {
    const checklist = this.buildLifecycleChecklist(steps);
    await this.store.completeOffboard(actorUserId, userId, checklist);
    await this.store.notifyUserInApp({
      userId,
      title: "Offboarding completato",
      body: "La procedura di uscita è stata chiusa da HR. Verifica il percorso per eventuali passi residui.",
      kind: "offboarding_complete",
      actionPath: "/percorso"
    });
  }

  async sendWizardReminder(input: {
    companyId: string;
    userId: string;
    requestedByUserId: string;
    pendingStepTitle?: string;
  }): Promise<{ ok: true }> {
    const wizard = await this.getWizard(input.userId);
    if (wizard.companyId !== input.companyId) {
      throw new NotFoundException("Wizard offboarding non trovato");
    }
    if (wizard.completedAt) {
      throw new BadRequestException("Wizard offboarding già completato");
    }
    if (wizard.cancelledAt) {
      throw new BadRequestException("Wizard offboarding annullato");
    }
    const pending =
      (input.pendingStepTitle
        ? HR_OFFBOARDING_WIZARD_STEPS.find((s) => s.titleIt === input.pendingStepTitle)
        : undefined) ??
      HR_OFFBOARDING_WIZARD_STEPS.find((s) => wizard.steps[s.key]?.done !== true);
    const stepLabel = pending?.titleIt ?? "wizard offboarding";
    await this.store.notifyUserInApp({
      userId: input.userId,
      title: "Promemoria offboarding HR",
      body: `Completa lo step «${stepLabel}» nel wizard Offboarding.`,
      kind: "offboarding_reminder",
      actionPath: `/hr/offboarding/wizard/${input.userId}`
    });
    return { ok: true };
  }

  async getEmployeeChecklist(userId: string): Promise<
    OnboardingStatus & {
      wizardCompleted: boolean;
      allStepsDone: boolean;
      progressPercent: number;
    }
  > {
    const user = await this.store.getUser(userId);
    if (!user) throw new NotFoundException("Utente non trovato");
    const status = await this.store.getOrCreateOffboarding(userId);
    const merged = this.mergeEmployeeChecklistItems(status);
    let wizardCompleted = false;
    try {
      const wizard = await this.getWizard(userId);
      wizardCompleted = Boolean(wizard.completedAt);
    } catch {
      wizardCompleted = false;
    }
    const allStepsDone = merged.checklist.every((i) => i.done);
    const doneCount = merged.checklist.filter((i) => i.done).length;
    const progressPercent =
      merged.checklist.length > 0 ? Math.round((doneCount / merged.checklist.length) * 100) : 0;
    return {
      ...merged,
      wizardCompleted,
      allStepsDone,
      progressPercent
    };
  }

  private mergeEmployeeChecklistItems(status: OnboardingStatus): OnboardingStatus {
    const byId = new Map(status.checklist.map((i) => [i.id, i]));
    for (const def of EMPLOYEE_OFFBOARDING_CHECKLIST) {
      if (!byId.has(def.id)) {
        status.checklist.push({ id: def.id, label: def.label, done: false });
      }
    }
    return status;
  }

  async patchEmployeeChecklistItem(
    userId: string,
    itemId: string,
    done: boolean,
    actorUserId: string,
    actorRole: "superuser" | "user"
  ): Promise<OnboardingStatus> {
    if (userId === actorUserId && actorRole !== "superuser" && !itemId.startsWith("emp-")) {
      throw new BadRequestException("Solo HR può aggiornare le voci gestite dal reparto");
    }
    return this.store.patchOffboardingItem(userId, itemId, done, actorUserId, actorRole);
  }

  async completeEmployeeOffboarding(userId: string): Promise<{ ok: true; phase: string }> {
    const checklist = await this.getEmployeeChecklist(userId);
    if (!checklist.allStepsDone) {
      throw new BadRequestException("Completa tutti i passi della checklist prima di confermare");
    }
    const st = await this.store.getOrCreateOffboarding(userId);
    st.phase = "completed";
    st.updatedAt = new Date().toISOString();
    const sb = this.sb();
    if (sb) {
      await sb
        .from("lifecycle_offboarding")
        .update({ phase: "completed", updatedAt: st.updatedAt })
        .eq("userId", userId);
    }
    return { ok: true, phase: st.phase };
  }

  async cancelOffboarding(input: { userId: string; companyId: string; actorUserId: string }): Promise<HrOffboardingWizardDto> {
    const user = await this.store.getUser(input.userId);
    if (!user || user.companyId !== input.companyId) {
      throw new NotFoundException("Dipendente non trovato");
    }

    await this.store.updateUser(input.userId, { employmentState: "active" });
    const now = new Date().toISOString();

    const sb = this.sb();
    if (!sb) {
      const mem = this.memWizard.get(input.userId);
      if (!mem) {
        throw new NotFoundException("Wizard offboarding non trovato");
      }
      const updated: HrOffboardingWizardDto = { ...mem, cancelledAt: now, updatedAt: now };
      this.memWizard.set(input.userId, updated);
      return updated;
    }

    const { data, error } = await sb
      .from("hr_offboarding_wizard")
      .update({
        cancelled_at: now,
        updated_at: now,
        updated_by_user_id: input.actorUserId
      })
      .eq("user_id", input.userId)
      .select("*")
      .single();
    if (error || !data) {
      throw new InternalServerErrorException(`Annullamento offboarding: ${error?.message ?? "nessun dato"}`);
    }
    return this.mapRow(data as Record<string, unknown>);
  }
}
