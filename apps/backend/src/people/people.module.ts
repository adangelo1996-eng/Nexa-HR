import { Module } from "@nestjs/common";
import { WorkforceModule } from "../workforce/workforce.module";
import { OrgController } from "./org.controller";
import { UserController } from "./user.controller";

@Module({
  imports: [WorkforceModule],
  controllers: [UserController, OrgController]
})
export class PeopleModule {}
