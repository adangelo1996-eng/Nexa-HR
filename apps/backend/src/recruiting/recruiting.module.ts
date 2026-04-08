import { Module } from "@nestjs/common";
import { PlatformModule } from "../platform/platform.module";
import { RecruitingController } from "./recruiting.controller";
import { RecruitingService } from "./recruiting.service";

@Module({
  imports: [PlatformModule],
  controllers: [RecruitingController],
  providers: [RecruitingService],
  exports: [RecruitingService]
})
export class RecruitingModule {}

