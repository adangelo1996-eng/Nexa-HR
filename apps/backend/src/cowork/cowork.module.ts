import { Module } from "@nestjs/common";
import { AiHrModule } from "../ai-hr/ai-hr.module";
import { AiPrivacyModule } from "../ai-privacy/ai-privacy.module";
import { CompensationModule } from "../compensation/compensation.module";
import { HrCenterModule } from "../hr-center/hr-center.module";
import { HrContractsModule } from "../hr-contracts/hr-contracts.module";
import { CorporatePoliciesModule } from "../corporate-policies/corporate-policies.module";
import { HrOffboardingModule } from "../hr-offboarding/hr-offboarding.module";
import { HrOnboardingModule } from "../hr-onboarding/hr-onboarding.module";
import { HrRecapModule } from "../hr-recap/hr-recap.module";
import { PlatformModule } from "../platform/platform.module";
import { RecruitingModule } from "../recruiting/recruiting.module";
import { ThirdPartyLicensesModule } from "../third-party-licenses/third-party-licenses.module";
import { TrainingModule } from "../training/training.module";
import { WorkforceModule } from "../workforce/workforce.module";
import { CoworkApplyLogStore } from "./cowork-apply-log.store";
import { CoworkRequestsStore } from "./cowork-requests.store";
import { CoworkPermissionsService } from "./cowork-permissions.service";
import { CoworkUndoService } from "./cowork-undo.service";
import { CoworkGenericExecutor } from "./executors/cowork-generic.executor";
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
  imports: [
    PlatformModule,
    AiPrivacyModule,
    AiHrModule,
    HrContractsModule,
    HrOffboardingModule,
    HrOnboardingModule,
    TrainingModule,
    CorporatePoliciesModule,
    HrCenterModule,
    HrRecapModule,
    CompensationModule,
    RecruitingModule,
    ThirdPartyLicensesModule,
    WorkforceModule
  ],
  controllers: [CoworkController],
  providers: [
    CoworkOrchestratorService,
    CoworkPlanHydrationService,
    CoworkPlannerService,
    CoworkPermissionsService,
    CoworkPlansStore,
    CoworkApplyLogStore,
    CoworkRequestsStore,
    CoworkUndoService,
    CoworkExecutorRegistry,
    CoworkGenericExecutor,
    SmartworkingAgreementsExecutor,
    SmartworkingRequestsExecutor,
    HrStandardContractsExecutor
  ],
  exports: [CoworkOrchestratorService]
})
export class CoworkModule {}
