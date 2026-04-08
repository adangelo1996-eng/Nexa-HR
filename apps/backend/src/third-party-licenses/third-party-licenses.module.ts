import { Module } from "@nestjs/common";
import { PlatformModule } from "../platform/platform.module";
import { ThirdPartyLicensesController } from "./third-party-licenses.controller";
import { ThirdPartyLicensesService } from "./third-party-licenses.service";

@Module({
  imports: [PlatformModule],
  controllers: [ThirdPartyLicensesController],
  providers: [ThirdPartyLicensesService],
  exports: [ThirdPartyLicensesService]
})
export class ThirdPartyLicensesModule {}
