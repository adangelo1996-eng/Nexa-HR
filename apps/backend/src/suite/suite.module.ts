import { Module } from "@nestjs/common";
import { SuiteIntegrationsController } from "./suite.controller";

@Module({
  controllers: [SuiteIntegrationsController]
})
export class SuiteIntegrationsModule {}
