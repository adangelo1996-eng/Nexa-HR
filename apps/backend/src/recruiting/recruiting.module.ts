import { Module } from "@nestjs/common";
import { AiHrModule } from "../ai-hr/ai-hr.module";
import { AiPrivacyModule } from "../ai-privacy/ai-privacy.module";
import { PlatformModule } from "../platform/platform.module";
import { LinkedInJobSyncService } from "./linkedin/linkedin-job-sync.service";
import { RecruitingLinkedInController } from "./linkedin/recruiting-linkedin.controller";
import { RecruitCvScreenService } from "./recruit-cv-screen.service";
import { RecruitingController } from "./recruiting.controller";
import { RecruitingService } from "./recruiting.service";

@Module({
  imports: [PlatformModule, AiPrivacyModule, AiHrModule],
  controllers: [RecruitingController, RecruitingLinkedInController],
  providers: [RecruitingService, RecruitCvScreenService, LinkedInJobSyncService],
  exports: [RecruitingService, RecruitCvScreenService, LinkedInJobSyncService]
})
export class RecruitingModule {}
