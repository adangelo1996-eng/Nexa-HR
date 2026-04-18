import { Controller, Get, UseGuards } from "@nestjs/common";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import { NEXA_HR_SUITE_AGGREGATE_EVENTS } from "./suite-contracts";

@Controller("integrations/suite")
@UseGuards(NexaPermissionGuard)
export class SuiteIntegrationsController {
  @Get("health")
  @RequireNexaPermissions("nexa.reports_hr:read")
  health(): { ok: boolean; service: string; schemaVersion: string } {
    return { ok: true, service: "nexa-hr-suite-contracts", schemaVersion: "2026-04-17" };
  }

  @Get("aggregate-events")
  @RequireNexaPermissions("nexa.reports_hr:read")
  aggregateEvents(): { items: Array<(typeof NEXA_HR_SUITE_AGGREGATE_EVENTS)[number]> } {
    return { items: [...NEXA_HR_SUITE_AGGREGATE_EVENTS] };
  }
}
