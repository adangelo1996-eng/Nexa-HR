import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { Type } from "class-transformer";
import { IsBoolean, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { PermissionsService } from "../platform/permissions.service";
import { NarrativeAnalyticsService } from "./narrative-analytics.service";

class PayrollWhatIfDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  period?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(999999)
  grossMonthlySalaryOverride?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  usePreviousMonthVariables?: boolean;
}

class NarrativeAnalyticsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  topic!: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  useLlm?: boolean;
}

class HitlProposalDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  kind!: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  rationale!: string;
}

class HitlDecisionDto {
  @Type(() => Boolean)
  @IsBoolean()
  approve!: boolean;
}

@Controller("analytics")
@UseGuards(NexaPermissionGuard)
export class AnalyticsController {
  constructor(
    private readonly store: HrDataStore,
    private readonly narrative: NarrativeAnalyticsService,
    private readonly permissions: PermissionsService
  ) {}

  @Post("payroll-what-if")
  @RequireNexaPermissions("nexa.reports_hr:read")
  async payrollWhatIf(
    @CurrentAuth() auth: AuthContext,
    @Body() body: PayrollWhatIfDto
  ): Promise<Awaited<ReturnType<HrDataStore["simulateItalianPayrollForUser"]>>> {
    const targetId = body.userId?.trim() || auth.userId;
    const viewer = await this.store.getUser(auth.userId);
    const subject = await this.store.getUser(targetId);
    if (viewer.companyId !== subject.companyId) {
      throw new ForbiddenException("Utente non nella stessa azienda");
    }
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

  @Get("workforce-cockpit")
  @RequireNexaPermissions("nexa.reports_hr:read")
  async workforceCockpit(
    @Query("scenario") scenario?: string,
    @Query("months") months?: string
  ): Promise<Awaited<ReturnType<HrDataStore["getWorkforceCockpit"]>>> {
    const sc =
      scenario === "growth" || scenario === "freeze" ? scenario : ("base" as const);
    const mo = months ? Math.min(12, Math.max(1, Number(months) || 6)) : 6;
    return this.store.getWorkforceCockpit(sc, mo);
  }

  @Get("hr-dashboard/summary")
  @RequireNexaPermissions("nexa.reports_hr:read")
  async summary(): Promise<{ headcount: number; budgetEur: number; pendingExpenseCount: number }> {
    return this.store.getHrDashboardSummary();
  }

  @Get("people-insights")
  @RequireNexaPermissions("nexa.reports_hr:read")
  async peopleInsights(): Promise<{ items: Awaited<ReturnType<HrDataStore["getPeopleInsightsRisk"]>> }> {
    return { items: await this.store.getPeopleInsightsRisk() };
  }

  @Get("hr-alerts")
  @RequireNexaPermissions("nexa.reports_hr:read")
  async listHrAlerts(
    @CurrentAuth() auth: AuthContext,
    @Query("status") status?: string
  ): Promise<{ items: Awaited<ReturnType<HrDataStore["listHrAlerts"]>> }> {
    const viewer = await this.store.getUser(auth.userId);
    const companyId = (viewer.companyId || auth.tenantId || "").trim();
    if (!companyId) {
      throw new ForbiddenException("Azienda non disponibile per l'utente");
    }
    const st =
      status === "open" || status === "ack" || status === "dismissed" ? (status as "open" | "ack" | "dismissed") : undefined;
    const items = await this.store.listHrAlerts(companyId, st);
    return { items };
  }

  @Post("hr-alerts/evaluate")
  @RequireNexaPermissions("nexa.reports_hr:read")
  async evaluateHrAlerts(@CurrentAuth() auth: AuthContext): Promise<Awaited<ReturnType<HrDataStore["evaluateHrAlertsForCompany"]>>> {
    const viewer = await this.store.getUser(auth.userId);
    const companyId = (viewer.companyId || auth.tenantId || "").trim();
    if (!companyId) {
      throw new ForbiddenException("Azienda non disponibile per l'utente");
    }
    return this.store.evaluateHrAlertsForCompany(companyId);
  }

  @Post("hr-alerts/:id/ack")
  @RequireNexaPermissions("nexa.reports_hr:read")
  async ackHrAlert(
    @CurrentAuth() auth: AuthContext,
    @Param("id") alertId: string
  ): Promise<{ ok: true }> {
    const viewer = await this.store.getUser(auth.userId);
    const companyId = (viewer.companyId || auth.tenantId || "").trim();
    if (!companyId) {
      throw new ForbiddenException("Azienda non disponibile per l'utente");
    }
    await this.store.acknowledgeHrAlert(companyId, alertId.trim(), auth.userId);
    return { ok: true };
  }

  @Get("skills-gap")
  @RequireNexaPermissions("nexa.reports_hr:read")
  async skillsGap(
    @CurrentAuth() auth: AuthContext,
    @Query("roleId") roleId?: string
  ): Promise<{ items: Awaited<ReturnType<HrDataStore["getSkillsGapReport"]>> }> {
    const viewer = await this.store.getUser(auth.userId);
    const companyId = (viewer.companyId || auth.tenantId || "").trim();
    if (!companyId) {
      throw new ForbiddenException("Azienda non disponibile per l'utente");
    }
    const items = await this.store.getSkillsGapReport(companyId, roleId?.trim() || undefined);
    return { items };
  }

  @Get("manager-copilot")
  @RequireNexaPermissions("nexa.approvals:read")
  async managerCopilot(@CurrentAuth() auth: AuthContext): Promise<
    Awaited<ReturnType<HrDataStore["getManagerCopilotDashboard"]>>
  > {
    const includeTurnover = await this.permissions.userHasAll(auth.userId, ["nexa.reports_hr:read"]);
    return this.store.getManagerCopilotDashboard(auth.userId, { includeTurnover });
  }

  @Get("turnover-retention")
  @RequireNexaPermissions("nexa.reports_hr:read")
  async turnoverRetention(
    @CurrentAuth() auth: AuthContext,
    @Query("costCenterId") costCenterId?: string,
    @Query("trendWeeks") trendWeeks?: string
  ): Promise<{
    items: Awaited<ReturnType<HrDataStore["getLatestTurnoverRetention"]>>;
    trend: Awaited<ReturnType<HrDataStore["getTurnoverRetentionTrend"]>>;
    companyId: string;
    modelVersion: string;
    costCenterOptions: string[];
  }> {
    const viewer = await this.store.getUser(auth.userId);
    const companyId = (viewer.companyId || auth.tenantId || "").trim();
    if (!companyId) {
      throw new ForbiddenException("Azienda non disponibile per l'utente");
    }
    const weeks = trendWeeks ? Math.min(52, Math.max(2, Number(trendWeeks) || 8)) : 8;
    const [items, trend, costCenterOptions] = await Promise.all([
      this.store.getLatestTurnoverRetention(companyId, costCenterId?.trim() || undefined),
      this.store.getTurnoverRetentionTrend(companyId, weeks),
      this.store.listCostCenterIdsForCompany(companyId)
    ]);
    return { items, trend, companyId, modelVersion: "rule-v1", costCenterOptions };
  }

  @Post("narrative")
  @RequireNexaPermissions("nexa.reports_hr:read")
  postNarrative(
    @CurrentAuth() auth: AuthContext,
    @Body() body: NarrativeAnalyticsDto
  ): ReturnType<NarrativeAnalyticsService["generate"]> {
    return this.narrative.generate(auth, {
      topic: body.topic,
      payload: body.payload,
      useLlm: body.useLlm
    });
  }

  @Post("turnover-retention/refresh")
  @RequireNexaPermissions("nexa.reports_hr:read")
  async turnoverRefresh(
    @CurrentAuth() auth: AuthContext
  ): Promise<Awaited<ReturnType<HrDataStore["refreshTurnoverSignalsForCompany"]>>> {
    const viewer = await this.store.getUser(auth.userId);
    const companyId = (viewer.companyId || auth.tenantId || "").trim();
    if (!companyId) {
      throw new ForbiddenException("Azienda non disponibile per l'utente");
    }
    return this.store.refreshTurnoverSignalsForCompany(companyId);
  }

  @Get("process-cycle-times")
  @RequireNexaPermissions("nexa.reports_hr:read")
  async processCycleTimes(@CurrentAuth() auth: AuthContext): Promise<Awaited<ReturnType<HrDataStore["getProcessCycleMetrics"]>>> {
    const viewer = await this.store.getUser(auth.userId);
    const companyId = (viewer.companyId || auth.tenantId || "").trim();
    if (!companyId) {
      throw new ForbiddenException("Azienda non disponibile per l'utente");
    }
    return this.store.getProcessCycleMetrics(companyId);
  }

  @Get("hitl/proposals")
  @RequireNexaPermissions("nexa.reports_hr:read")
  async listHitl(@CurrentAuth() auth: AuthContext): Promise<{ items: Awaited<ReturnType<HrDataStore["listHitlProposals"]>> }> {
    const viewer = await this.store.getUser(auth.userId);
    const companyId = (viewer.companyId || auth.tenantId || "").trim();
    if (!companyId) {
      throw new ForbiddenException("Azienda non disponibile per l'utente");
    }
    const items = await this.store.listHitlProposals(companyId);
    return { items };
  }

  @Post("hitl/proposals")
  @RequireNexaPermissions("nexa.reports_hr:read")
  async createHitl(
    @CurrentAuth() auth: AuthContext,
    @Body() body: HitlProposalDto
  ): Promise<{ id: string }> {
    const viewer = await this.store.getUser(auth.userId);
    const companyId = (viewer.companyId || auth.tenantId || "").trim();
    if (!companyId) {
      throw new ForbiddenException("Azienda non disponibile per l'utente");
    }
    return this.store.createHitlProposal(companyId, auth.userId, {
      kind: body.kind,
      payload: body.payload,
      rationale: body.rationale
    });
  }

  @Post("hitl/proposals/:id/decision")
  @RequireNexaPermissions("nexa.reports_hr:read")
  async decideHitl(
    @CurrentAuth() auth: AuthContext,
    @Param("id") proposalId: string,
    @Body() body: HitlDecisionDto
  ): Promise<{ id: string; status: string }> {
    const viewer = await this.store.getUser(auth.userId);
    const companyId = (viewer.companyId || auth.tenantId || "").trim();
    if (!companyId) {
      throw new ForbiddenException("Azienda non disponibile per l'utente");
    }
    return this.store.decideHitlProposal(companyId, proposalId.trim(), auth.userId, body.approve === true);
  }

  @Get("forecast-payroll")
  @RequireNexaPermissions("nexa.reports_hr:read")
  async forecast(
    @Query("months") months?: string
  ): Promise<{ series: Awaited<ReturnType<HrDataStore["payrollForecastNextMonths"]>> }> {
    const m = months ? Math.min(12, Math.max(1, Number(months) || 3)) : 3;
    return { series: await this.store.payrollForecastNextMonths(m) };
  }
}
