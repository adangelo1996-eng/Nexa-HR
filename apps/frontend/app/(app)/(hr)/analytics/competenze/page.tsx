"use client";

import { AdvancedAnalyticsPage } from "@/components/advanced-analytics-page";

export default function AnalyticsCompetenzePage(): React.JSX.Element {
  return (
    <AdvancedAnalyticsPage
      analysisId="competenze"
      title="Gap competenze"
      subtitle="Gap competenze vs fabbisogno per ruolo. Matrice raccomandazioni hiring vs formazione."
    />
  );
}
