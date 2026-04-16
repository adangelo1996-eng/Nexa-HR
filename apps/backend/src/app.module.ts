import { Module } from "@nestjs/common";
import { AiHrModule } from "./ai-hr/ai-hr.module";
import { AiPrivacyModule } from "./ai-privacy/ai-privacy.module";
import { HebbHrModule } from "./ai/hebb-hr.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { CompensationModule } from "./compensation/compensation.module";
import { DocumentsModule } from "./documents/documents.module";
import { HrContractsModule } from "./hr-contracts/hr-contracts.module";
import { ExpensesModule } from "./expenses/expenses.module";
import { InnovationModule } from "./innovation/innovation.module";
import { LifecycleModule } from "./lifecycle/lifecycle.module";
import { PeopleModule } from "./people/people.module";
import { PlatformModule } from "./platform/platform.module";
import { RecruitingModule } from "./recruiting/recruiting.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { SchedulingModule } from "./scheduling/scheduling.module";
import { ThirdPartyLicensesModule } from "./third-party-licenses/third-party-licenses.module";
import { TimeoffModule } from "./timeoff/timeoff.module";
import { WorkforceModule } from "./workforce/workforce.module";

@Module({
  imports: [
    AiPrivacyModule,
    PlatformModule,
    WorkforceModule,
    TimeoffModule,
    PeopleModule,
    CompensationModule,
    SchedulingModule,
    DocumentsModule,
    ExpensesModule,
    LifecycleModule,
    AnalyticsModule,
    InnovationModule,
    RealtimeModule,
    RecruitingModule,
    HrContractsModule,
    ThirdPartyLicensesModule,
    HebbHrModule,
    AiHrModule
  ]
})
export class AppModule {}
