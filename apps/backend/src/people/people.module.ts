import { Module } from "@nestjs/common";
import { AiHrModule } from "../ai-hr/ai-hr.module";
import { AiPrivacyModule } from "../ai-privacy/ai-privacy.module";
import { HrOnboardingModule } from "../hr-onboarding/hr-onboarding.module";
import { WorkforceModule } from "../workforce/workforce.module";
import { CompanySettingsController } from "./company-settings.controller";
import { HiringSimulatorController } from "./hiring-simulator.controller";
import { HiringSimulatorService } from "./hiring-simulator.service";
import { MeetingRoomsController } from "./meeting-rooms.controller";
import { OrgController } from "./org.controller";
import { PersonnelBudgetController } from "./personnel-budget.controller";
import { UserController } from "./user.controller";
import { WorkCalendarController } from "./work-calendar.controller";

@Module({
  imports: [WorkforceModule, AiPrivacyModule, AiHrModule, HrOnboardingModule],
  controllers: [
    UserController,
    OrgController,
    PersonnelBudgetController,
    HiringSimulatorController,
    WorkCalendarController,
    CompanySettingsController,
    MeetingRoomsController
  ],
  providers: [HiringSimulatorService]
})
export class PeopleModule {}
