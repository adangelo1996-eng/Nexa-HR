import { Module } from "@nestjs/common";
import { AiHrModule } from "../ai-hr/ai-hr.module";
import { AiPrivacyModule } from "../ai-privacy/ai-privacy.module";
import { HrContractsModule } from "../hr-contracts/hr-contracts.module";
import { HrCenterController } from "./hr-center.controller";
import { HrCenterService } from "./hr-center.service";

@Module({
  imports: [AiPrivacyModule, AiHrModule, HrContractsModule],
  controllers: [HrCenterController],
  providers: [HrCenterService]
})
export class HrCenterModule {}
