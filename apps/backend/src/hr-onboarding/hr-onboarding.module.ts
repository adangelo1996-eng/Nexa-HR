import { Module } from "@nestjs/common";
import { PlatformModule } from "../platform/platform.module";
import { RecruitingModule } from "../recruiting/recruiting.module";
import { TrainingModule } from "../training/training.module";
import { HrOnboardingBuddyService } from "./hr-onboarding-buddy.service";
import { HrOnboardingController } from "./hr-onboarding.controller";
import { HrOnboardingService } from "./hr-onboarding.service";

@Module({
  imports: [PlatformModule, RecruitingModule, TrainingModule],
  controllers: [HrOnboardingController],
  providers: [HrOnboardingService, HrOnboardingBuddyService],
  exports: [HrOnboardingService, HrOnboardingBuddyService]
})
export class HrOnboardingModule {}
