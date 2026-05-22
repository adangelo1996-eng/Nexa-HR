import { Module } from "@nestjs/common";
import { PlatformModule } from "../platform/platform.module";
import { HrOffboardingController } from "./hr-offboarding.controller";
import { HrOffboardingService } from "./hr-offboarding.service";

@Module({
  imports: [PlatformModule],
  controllers: [HrOffboardingController],
  providers: [HrOffboardingService],
  exports: [HrOffboardingService]
})
export class HrOffboardingModule {}
