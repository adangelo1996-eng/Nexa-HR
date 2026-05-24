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
import { HebbMateApplyLogStore } from "./hebb-mate-apply-log.store";
import { HebbMateAutomationsStore } from "./hebb-mate-automations.store";
import { HebbMateController } from "./hebb-mate.controller";
import { HebbMateProposalsStore } from "./hebb-mate-proposals.store";
import { HebbMateService } from "./hebb-mate.service";
import { HebbMateUndoService } from "./hebb-mate-undo.service";
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
    HebbMateService,
    HebbMateProposalsStore,
    HebbMateApplyLogStore,
    HebbMateAutomationsStore,
    HebbMateUndoService
  ],
  exports: [AiAuditService, AiOpenAiRefinementService, NexaPlatformAgentService, FieldSuggestService, HebbMateService]
})
export class AiHrModule {}
