import { forwardRef, Global, Module } from "@nestjs/common";
import { PlatformModule } from "../platform/platform.module";
import { RemoteWorkPolicyService } from "./remote-work-policy.service";

/** Smartworking / remote-work policy — kept separate from PlatformModule to avoid import cycles with HrDataStore. */
@Global()
@Module({
  imports: [forwardRef(() => PlatformModule)],
  providers: [RemoteWorkPolicyService],
  exports: [RemoteWorkPolicyService]
})
export class SmartworkingModule {}
