import { Module } from "@nestjs/common";
import { InnovationController } from "./innovation.controller";

@Module({
  controllers: [InnovationController]
})
export class InnovationModule {}
