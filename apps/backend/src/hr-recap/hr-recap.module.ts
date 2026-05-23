import { Module } from "@nestjs/common";
import { PlatformModule } from "../platform/platform.module";
import { RecruitingModule } from "../recruiting/recruiting.module";
import { HrRecapController } from "./hr-recap.controller";
import { HrRecapService } from "./hr-recap.service";

@Module({
  imports: [PlatformModule, RecruitingModule],
  controllers: [HrRecapController],
  providers: [HrRecapService],
  exports: [HrRecapService]
})
export class HrRecapModule {}
