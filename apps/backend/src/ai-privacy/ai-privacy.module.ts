import { Module } from "@nestjs/common";
import { AiPrivacyController } from "./ai-privacy.controller";
import { AiPrivacyGateway } from "./ai-privacy-gateway.service";
import { TokenVaultService } from "./token-vault.service";

@Module({
  controllers: [AiPrivacyController],
  providers: [TokenVaultService, AiPrivacyGateway],
  exports: [TokenVaultService, AiPrivacyGateway]
})
export class AiPrivacyModule {}
