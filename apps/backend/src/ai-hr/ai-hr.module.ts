import { Module, forwardRef } from "@nestjs/common";
import { AiPrivacyModule } from "../ai-privacy/ai-privacy.module";
import { CorporatePoliciesModule } from "../corporate-policies/corporate-policies.module";
import { HrContractsModule } from "../hr-contracts/hr-contracts.module";
import { RecruitingModule } from "../recruiting/recruiting.module";
import { TrainingModule } from "../training/training.module";
import { AiAuditService } from "./ai-audit.service";
import { AiHrController } from "./ai-hr.controller";
import { AiHrService } from "./ai-hr.service";
import { AiOpenAiRefinementService } from "./ai-openai-refinement.service";
import { FieldSuggestService } from "./field-suggest.service";
import { HebbMateController } from "./hebb-mate.controller";
import { HebbMateService } from "./hebb-mate.service";
import { NexaPlatformAgentService } from "./nexa-platform-agent.service";

@Module({
  imports: [AiPrivacyModule, CorporatePoliciesModule, TrainingModule, HrContractsModule, forwardRef(() => RecruitingModule)],
  controllers: [AiHrController, HebbMateController],
  providers: [
    AiHrService,
    AiAuditService,
    AiOpenAiRefinementService,
    NexaPlatformAgentService,
    FieldSuggestService,
    HebbMateService
  ],
  exports: [AiAuditService, AiOpenAiRefinementService, NexaPlatformAgentService, FieldSuggestService, HebbMateService]
})
export class AiHrModule {}
