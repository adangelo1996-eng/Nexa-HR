"use client";

import { AdvancedAnalyticsPage } from "@/components/advanced-analytics-page";
import { CompetenzeAnalyticsWorkspace } from "@/components/competenze-analytics-workspace";

export default function AnalyticsCompetenzePage(): React.JSX.Element {
  return (
    <AdvancedAnalyticsPage
      analysisId="competenze"
      title="Competenze e copertura ruoli"
      subtitle="Gap headcount e competenze per ruolo, con impatto economico e collegamenti budget."
      pageHelpKey="analytics-competenze"
    >
      <CompetenzeAnalyticsWorkspace />
    </AdvancedAnalyticsPage>
  );
}
