import { Module } from "@nestjs/common";
import { AiPrivacyModule } from "../ai-privacy/ai-privacy.module";
import { CorporatePoliciesModule } from "../corporate-policies/corporate-policies.module";
import { AiAuditService } from "./ai-audit.service";
import { AiHrController } from "./ai-hr.controller";
import { AiHrService } from "./ai-hr.service";
import { AiOpenAiRefinementService } from "./ai-openai-refinement.service";

@Module({
  imports: [AiPrivacyModule, CorporatePoliciesModule],
  controllers: [AiHrController],
  providers: [AiHrService, AiAuditService, AiOpenAiRefinementService],
  exports: [AiAuditService, AiOpenAiRefinementService]
})
export class AiHrModule {}
