import { Module } from "@nestjs/common";
import { AiHrModule } from "../ai-hr/ai-hr.module";
import { AiPrivacyModule } from "../ai-privacy/ai-privacy.module";
import { HrContractsModule } from "../hr-contracts/hr-contracts.module";
import { PlatformModule } from "../platform/platform.module";
import { CoworkController } from "./cowork.controller";
import { CoworkOrchestratorService } from "./cowork-orchestrator.service";
import { CoworkPlanHydrationService } from "./cowork-plan-hydration.service";
import { CoworkPlannerService } from "./cowork-planner.service";
import { CoworkPlansStore } from "./cowork-plans.store";
import { CoworkExecutorRegistry } from "./executors/cowork-executor.registry";
import { HrStandardContractsExecutor } from "./executors/hr-standard-contracts.executor";
import { SmartworkingAgreementsExecutor } from "./executors/smartworking-agreements.executor";
import { SmartworkingRequestsExecutor } from "./executors/smartworking-requests.executor";

@Module({
  imports: [PlatformModule, AiPrivacyModule, AiHrModule, HrContractsModule],
  controllers: [CoworkController],
  providers: [
    CoworkOrchestratorService,
    CoworkPlanHydrationService,
    CoworkPlannerService,
    CoworkPlansStore,
    CoworkExecutorRegistry,
    SmartworkingAgreementsExecutor,
    SmartworkingRequestsExecutor,
    HrStandardContractsExecutor
  ],
  exports: [CoworkOrchestratorService]
})
export class CoworkModule {}
