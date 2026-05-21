"use client";

import { AdvancedAnalyticsPage } from "@/components/advanced-analytics-page";

export default function AdvancedProduttivitaPage(): React.JSX.Element {
  return (
    <AdvancedAnalyticsPage
      analysisId="produttivita"
      title="Produttività e assenteismo"
      subtitle="Ore lavorate, straordinari e giorni di assenza su aggregati per centro di costo. Correlazioni indicative con retention e costo del personale."
    />
  );
}
