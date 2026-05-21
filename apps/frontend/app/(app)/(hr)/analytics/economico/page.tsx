"use client";

import { AdvancedAnalyticsPage } from "@/components/advanced-analytics-page";

export default function AnalyticsEconomicoPage(): React.JSX.Element {
  return (
    <AdvancedAnalyticsPage
      hubVariant="core"
      analysisId="economico"
      title="Controllo economico workforce"
      subtitle="Budget vs actual vs forecast per centro di costo, driver di varianza e trend costo FTE."
    />
  );
}
