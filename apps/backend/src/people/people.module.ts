import { Module } from "@nestjs/common";
import { WorkforceModule } from "../workforce/workforce.module";
import { OrgController } from "./org.controller";
import { PersonnelBudgetController } from "./personnel-budget.controller";
import { UserController } from "./user.controller";

@Module({
  imports: [WorkforceModule],
  controllers: [UserController, OrgController, PersonnelBudgetController]
})
export class PeopleModule {}
