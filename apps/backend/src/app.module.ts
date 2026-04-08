import { Module } from "@nestjs/common";
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
import { TimeoffModule } from "./timeoff/timeoff.module";
import { WorkforceModule } from "./workforce/workforce.module";

@Module({
  imports: [
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
    HebbHrModule
  ]
})
export class AppModule {}
