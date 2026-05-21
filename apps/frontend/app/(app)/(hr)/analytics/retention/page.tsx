"use client";

import { AdvancedAnalyticsPage } from "@/components/advanced-analytics-page";

export default function AnalyticsRetentionPage(): React.JSX.Element {
  return (
    <AdvancedAnalyticsPage
      hubVariant="core"
      analysisId="retention"
      title="Retention e flight risk"
      subtitle="Segnali turnover, assenze e tenure su aggregati per fascia e centro di costo."
    />
  );
}
