import { Module } from "@nestjs/common";
import { PlatformModule } from "../platform/platform.module";
import { HrContractsController } from "./hr-contracts.controller";
import { HrContractsBatchService } from "./hr-contracts-batch.service";
import { HrContractsService } from "./hr-contracts.service";

@Module({
  imports: [PlatformModule],
  controllers: [HrContractsController],
  providers: [HrContractsService, HrContractsBatchService],
  exports: [HrContractsService, HrContractsBatchService]
})
export class HrContractsModule {}
