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
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { Type } from "class-transformer";
import { IsBoolean, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { HrDataStore } from "../platform/hr-data.store";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { PermissionsService } from "../platform/permissions.service";
import { AnalyticsOrchestratorService } from "./analytics-orchestrator.service";
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

class HitlProposalDraftDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  intent!: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  useLlm?: boolean;
}

class HubRunDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  useLlm?: boolean;
}

class AnalysisChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

@Controller("analytics")
@UseGuards(NexaPermissionGuard)
export class AnalyticsController {
  constructor(
    private readonly store: HrDataStore,
    private readonly narrative: NarrativeAnalyticsService,
    private readonly orchestrator: AnalyticsOrchestratorService,
    private readonly permissions: PermissionsService
  ) {}

  @Get("hub")
  @RequireNexaPermissions("nexa.reports_hr:read")
  hubCatalog(): { cards: ReturnType<AnalyticsOrchestratorService["listHubCards"]> } {
    return { cards: this.orchestrator.listHubCards() };
  }

  @Get("advanced/hub")
  @RequireNexaPermissions("nexa.reports_hr:read")
  advancedHubCatalog(): { cards: ReturnType<AnalyticsOrchestratorService["listAdvancedHubCards"]> } {
    return { cards: this.orchestrator.listAdvancedHubCards() };
  }

  @Post("hub/:analysisId/run")
  @RequireNexaPermissions("nexa.reports_hr:read")
  runHubAnalysis(
    @CurrentAuth() auth: AuthContext,
    @Param("analysisId") analysisId: string,
    @Body() body: HubRunDto
  ): ReturnType<AnalyticsOrchestratorService["runHubAnalysis"]> {
    return this.orchestrator.runHubAnalysis(auth, analysisId, { useLlm: body.useLlm });
  }

  @Get("advanced/:analysisId/kpis")
  @RequireNexaPermissions("nexa.reports_hr:read")
  getAdvancedKpis(
    @CurrentAuth() auth: AuthContext,
    @Param("analysisId") analysisId: string
  ): ReturnType<AnalyticsOrchestratorService["getAnalysisKpis"]> {
    return this.orchestrator.getAnalysisKpis(auth, analysisId);
  }

  @Post("advanced/:analysisId/insight")
  @RequireNexaPermissions("nexa.reports_hr:read")
  postAdvancedInsight(
    @CurrentAuth() auth: AuthContext,
    @Param("analysisId") analysisId: string,
    @Body() body: HubRunDto
  ): ReturnType<AnalyticsOrchestratorService["generateStructuredInsight"]> {
    return this.orchestrator.generateStructuredInsight(auth, analysisId, { useLlm: body.useLlm });
  }

  @Post("advanced/:analysisId/chat")
  @RequireNexaPermissions("nexa.reports_hr:read")
  postAdvancedChat(
    @CurrentAuth() auth: AuthContext,
    @Param("analysisId") analysisId: string,
    @Body() body: AnalysisChatDto
  ): ReturnType<AnalyticsOrchestratorService["chatWithAnalyst"]> {
    return this.orchestrator.chatWithAnalyst(auth, analysisId, {
      message: body.message,
      history: body.history
    });
  }

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
    @Query("months") months?: string,
    @Query("fteDelta") fteDelta?: string,
    @Query("monthlyFlatDeltaEur") monthlyFlatDeltaEur?: string,
    @Query("seriesScalePercent") seriesScalePercent?: string
  ): Promise<Awaited<ReturnType<HrDataStore["getWorkforceCockpit"]>>> {
    const sc =
      scenario === "growth" || scenario === "freeze" || scenario === "custom"
        ? scenario
        : ("base" as const);
    const mo = months ? Math.min(12, Math.max(1, Number(months) || 6)) : 6;
    const custom =
      sc === "custom"
        ? {
            fteDelta: fteDelta != null && fteDelta !== "" ? Number(fteDelta) : 0,
            monthlyFlatDeltaEur:
              monthlyFlatDeltaEur != null && monthlyFlatDeltaEur !== "" ? Number(monthlyFlatDeltaEur) : 0,
            seriesScalePercent:
              seriesScalePercent != null && seriesScalePercent !== "" ? Number(seriesScalePercent) : 100
          }
        : undefined;
    return this.store.getWorkforceCockpit(sc, mo, custom);
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
  async managerCopilot(@CurrentAuth() auth: AuthContext): Promise<
    Awaited<ReturnType<HrDataStore["getManagerCopilotDashboard"]>>
  > {
    if (auth.role !== "superuser") {
      const hasApprovals = await this.permissions.userHasAll(auth.userId, ["nexa.approvals:read"]);
      const leadIds = await this.store.listWorkTeamIdsWhereUserIsLead(auth.userId);
      const directs = await this.store.listUsersByManager(auth.userId);
      if (!hasApprovals && leadIds.length === 0 && directs.length === 0) {
        throw new ForbiddenException(
          "HEBB AI for HR — Manager: serve permesso approvazioni, oppure essere lead di un team o avere report diretti."
        );
      }
    }
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
    costCenters: Array<{ id: string; label: string }>;
  }> {
    const viewer = await this.store.getUser(auth.userId);
    const companyId = (viewer.companyId || auth.tenantId || "").trim();
    if (!companyId) {
      throw new ForbiddenException("Azienda non disponibile per l'utente");
    }
    const weeks = trendWeeks ? Math.min(52, Math.max(2, Number(trendWeeks) || 8)) : 8;
    const [items, trend, costCenters] = await Promise.all([
      this.store.getLatestTurnoverRetention(companyId, costCenterId?.trim() || undefined),
      this.store.getTurnoverRetentionTrend(companyId, weeks),
      this.store.listCostCentersForTurnoverFilter(companyId)
    ]);
    return { items, trend, companyId, modelVersion: "rule-v1", costCenters };
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

  @Post("hitl/proposal-draft")
  @RequireNexaPermissions("nexa.reports_hr:read")
  postHitlProposalDraft(
    @CurrentAuth() auth: AuthContext,
    @Body() body: HitlProposalDraftDto
  ): ReturnType<NarrativeAnalyticsService["generateHitlProposalDraft"]> {
    return this.narrative.generateHitlProposalDraft(auth, {
      intent: body.intent,
      useLlm: body.useLlm
    });
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

  @Get("forecast-payroll-breakdown")
  @RequireNexaPermissions("nexa.reports_hr:read")
  async forecastBreakdown(
    @CurrentAuth() auth: AuthContext,
    @Query("months") months?: string
  ): Promise<Awaited<ReturnType<HrDataStore["payrollForecastCostBreakdown"]>>> {
    const viewer = await this.store.getUser(auth.userId);
    const companyId = (viewer.companyId || auth.tenantId || "").trim();
    if (!companyId) {
      throw new ForbiddenException("Azienda non disponibile per l'utente");
    }
    const m = months ? Math.min(12, Math.max(1, Number(months) || 6)) : 6;
    return this.store.payrollForecastCostBreakdown(companyId, m);
  }
}
