import { Module } from "@nestjs/common";
import { HebbHrController } from "./hebb-hr.controller";
import { HebbHrService } from "./hebb-hr.service";

@Module({
  controllers: [HebbHrController],
  providers: [HebbHrService]
})
export class HebbHrModule {}
