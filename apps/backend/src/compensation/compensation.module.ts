import { Module } from "@nestjs/common";
import { AiHrModule } from "../ai-hr/ai-hr.module";
import { AiPrivacyModule } from "../ai-privacy/ai-privacy.module";
import { RecruitingModule } from "../recruiting/recruiting.module";
import { WorkforceModule } from "../workforce/workforce.module";
import { CompensationBenchController } from "./compensation-bench.controller";
import { CompensationBenchService } from "./compensation-bench.service";
import { PayslipExplainService } from "./payslip-explain.service";
import { PayrollController } from "./payroll.controller";

@Module({
  imports: [WorkforceModule, AiPrivacyModule, AiHrModule, RecruitingModule],
  controllers: [PayrollController, CompensationBenchController],
  providers: [CompensationBenchService, PayslipExplainService],
  exports: [CompensationBenchService]
})
export class CompensationModule {}
