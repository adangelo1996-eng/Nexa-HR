import { Module } from "@nestjs/common";
import { AiPrivacyModule } from "../ai-privacy/ai-privacy.module";
import { CorporatePoliciesModule } from "../corporate-policies/corporate-policies.module";
import { TrainingModule } from "../training/training.module";
import { AiAuditService } from "./ai-audit.service";
import { AiHrController } from "./ai-hr.controller";
import { AiHrService } from "./ai-hr.service";
import { AiOpenAiRefinementService } from "./ai-openai-refinement.service";
import { FieldSuggestService } from "./field-suggest.service";
import { NexaPlatformAgentService } from "./nexa-platform-agent.service";

@Module({
  imports: [AiPrivacyModule, CorporatePoliciesModule, TrainingModule],
  controllers: [AiHrController],
  providers: [
    AiHrService,
    AiAuditService,
    AiOpenAiRefinementService,
    NexaPlatformAgentService,
    FieldSuggestService
  ],
  exports: [AiAuditService, AiOpenAiRefinementService, NexaPlatformAgentService, FieldSuggestService]
})
export class AiHrModule {}
