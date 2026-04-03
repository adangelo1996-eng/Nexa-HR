import { Module } from "@nestjs/common";
import { WorkforceModule } from "../workforce/workforce.module";
import { PayrollController } from "./payroll.controller";

@Module({
  imports: [WorkforceModule],
  controllers: [PayrollController]
})
export class CompensationModule {}
