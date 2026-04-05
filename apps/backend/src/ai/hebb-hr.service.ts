import { ForbiddenException, Injectable } from "@nestjs/common";
import type { AuthRole } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { PermissionsService } from "../platform/permissions.service";

/**
 * Hebb HR: motore payroll interno senza chiamate LLM esterne.
 * Variabili `HEBB_LLM_*` non sono più utilizzate.
 */
@Injectable()
export class HebbHrService {
  constructor(
    private readonly store: HrDataStore,
    private readonly permissions: PermissionsService
  ) {}

  private async assertPayrollCalcAccess(auth: { userId: string; role: AuthRole }): Promise<void> {
    if (auth.role === "superuser") {
      return;
    }
    const me = await this.store.getUser(auth.userId);
    const canHr = await this.permissions.canAccessHrExtendedConsole(auth.userId, auth.role, me.email);
    if (!canHr) {
      throw new ForbiddenException("Hebb HR riservato agli amministratori con accesso area payroll");
    }
  }

  private async assertSameCompanyUnlessSuperuser(
    auth: { userId: string; role: AuthRole },
    targetUserId: string
  ): Promise<void> {
    if (auth.role === "superuser") {
      return;
    }
    const viewer = await this.store.getUser(auth.userId);
    const target = await this.store.getUser(targetUserId);
    if (viewer.companyId !== target.companyId) {
      throw new ForbiddenException("Utente non nella stessa azienda");
    }
  }

  /**
   * Simulazione cedolino IT con dati anagrafici (nessuna persistenza, nessuna rete esterna).
   */
  async simulateIt(
    auth: { userId: string; role: AuthRole },
    body: {
      userId?: string;
      period?: string;
      grossMonthlySalaryOverride?: number;
      usePreviousMonthVariables?: boolean;
    }
  ): Promise<unknown> {
    await this.assertPayrollCalcAccess(auth);
    const targetId = body.userId?.trim() || auth.userId;
    await this.assertSameCompanyUnlessSuperuser(auth, targetId);
    const period = body.period?.trim() || new Date().toISOString().slice(0, 7);
    const variablePeriod =
      body.usePreviousMonthVariables === true
        ? this.store.previousPayrollVariableMonth(period)
        : period;
    const overrides =
      body.grossMonthlySalaryOverride != null && Number.isFinite(body.grossMonthlySalaryOverride)
        ? { grossMonthlySalary: Number(body.grossMonthlySalaryOverride) }
        : undefined;
    return this.store.simulateItalianPayrollForUser(targetId, period, {
      overrides,
      variablePeriod
    });
  }
}
