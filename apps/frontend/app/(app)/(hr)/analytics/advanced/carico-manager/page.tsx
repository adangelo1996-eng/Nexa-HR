"use client";

import { AdvancedAnalyticsPage } from "@/components/advanced-analytics-page";

export default function AdvancedCaricoManagerPage(): React.JSX.Element {
  return (
    <AdvancedAnalyticsPage
      analysisId="carico_manager"
      title="Carico manager e colli di bottiglia"
      subtitle="Report diretti e code di approvazione per cluster manager pseudonimizzati. Priorità di delega e riduzione backlog operativo."
    />
  );
}
