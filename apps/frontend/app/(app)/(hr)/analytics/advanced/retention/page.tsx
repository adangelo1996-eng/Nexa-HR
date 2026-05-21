"use client";

import { AdvancedAnalyticsPage } from "@/components/advanced-analytics-page";

export default function AdvancedRetentionPage(): React.JSX.Element {
  return (
    <AdvancedAnalyticsPage
      analysisId="retention"
      title="Retention e flight risk"
      subtitle="Segnali turnover, assenze e tenure su fasce e centri di costo. Playbook retention senza esporre nominativi al modello linguistico."
    />
  );
}
