import { Module } from "@nestjs/common";
import { WorkforceModule } from "../workforce/workforce.module";
import { OrgController } from "./org.controller";
import { PersonnelBudgetController } from "./personnel-budget.controller";
import { UserController } from "./user.controller";
import { WorkCalendarController } from "./work-calendar.controller";

@Module({
  imports: [WorkforceModule],
  controllers: [UserController, OrgController, PersonnelBudgetController, WorkCalendarController]
})
export class PeopleModule {}
