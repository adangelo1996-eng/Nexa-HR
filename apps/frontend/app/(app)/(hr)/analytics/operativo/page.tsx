"use client";

import { AdvancedAnalyticsPage } from "@/components/advanced-analytics-page";

export default function AnalyticsOperativoPage(): React.JSX.Element {
  return (
    <AdvancedAnalyticsPage
      analysisId="operativo"
      title="Sintesi operativa HR"
      subtitle="Approvazioni in sospeso, onboarding/offboarding, delta organico e backlog spese. Briefing giornaliero per HRBP."
    />
  );
}
