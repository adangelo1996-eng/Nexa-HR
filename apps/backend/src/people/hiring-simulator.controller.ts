import { Body, Controller, Delete, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentAuth, type AuthContext } from "../platform/auth";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";
import {
  HiringSimulatorAdviseDto,
  HiringSimulatorDeleteScenarioDto,
  HiringSimulatorInputDto,
  HiringSimulatorSaveScenarioDto
} from "./hiring-simulator.dto";
import { HiringSimulatorService } from "./hiring-simulator.service";

@Controller("hr/personnel-budget/hiring-simulator")
@UseGuards(NexaPermissionGuard)
export class HiringSimulatorController {
  constructor(private readonly simulator: HiringSimulatorService) {}

  @Post("compute")
  @RequireNexaPermissions("nexa.personnel_budget:read")
  compute(@Body() body: HiringSimulatorInputDto) {
    return { result: this.simulator.compute(body) };
  }

  @Post("advise")
  @RequireNexaPermissions("nexa.personnel_budget:read")
  advise(@CurrentAuth() auth: AuthContext, @Body() body: HiringSimulatorAdviseDto) {
    return this.simulator.advise(auth, body);
  }

  @Get("scenarios")
  @RequireNexaPermissions("nexa.personnel_budget:read")
  async listScenarios(@CurrentAuth() auth: AuthContext) {
    const items = await this.simulator.listScenarios(auth);
    return { items };
  }

  @Post("scenarios")
  @RequireNexaPermissions("nexa.personnel_budget:write")
  saveScenario(@CurrentAuth() auth: AuthContext, @Body() body: HiringSimulatorSaveScenarioDto) {
    return this.simulator.saveScenario(auth, body);
  }

  @Delete("scenarios")
  @RequireNexaPermissions("nexa.personnel_budget:write")
  deleteScenario(@CurrentAuth() auth: AuthContext, @Body() body: HiringSimulatorDeleteScenarioDto) {
    return this.simulator.deleteScenario(auth, body.id);
  }
}
