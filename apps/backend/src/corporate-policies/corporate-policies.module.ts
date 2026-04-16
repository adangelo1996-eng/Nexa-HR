import { Module } from "@nestjs/common";
import { CorporatePoliciesController } from "./corporate-policies.controller";
import { CorporatePoliciesService } from "./corporate-policies.service";

@Module({
  controllers: [CorporatePoliciesController],
  providers: [CorporatePoliciesService],
  exports: [CorporatePoliciesService]
})
export class CorporatePoliciesModule {}
