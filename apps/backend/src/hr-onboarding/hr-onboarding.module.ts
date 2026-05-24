import { Module } from "@nestjs/common";
import { AiHrModule } from "../ai-hr/ai-hr.module";
import { AiPrivacyModule } from "../ai-privacy/ai-privacy.module";
import { PlatformModule } from "../platform/platform.module";
import { RecruitingModule } from "../recruiting/recruiting.module";
import { TrainingModule } from "../training/training.module";
import { HrOnboardingBuddyService } from "./hr-onboarding-buddy.service";
import { HrOnboardingController } from "./hr-onboarding.controller";
import { HrOnboardingService } from "./hr-onboarding.service";

@Module({
  imports: [PlatformModule, RecruitingModule, TrainingModule, AiPrivacyModule, AiHrModule],
  controllers: [HrOnboardingController],
  providers: [HrOnboardingService, HrOnboardingBuddyService],
  exports: [HrOnboardingService, HrOnboardingBuddyService]
})
export class HrOnboardingModule {}
