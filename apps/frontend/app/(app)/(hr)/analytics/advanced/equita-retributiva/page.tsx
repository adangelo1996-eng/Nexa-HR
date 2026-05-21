"use client";

import { AdvancedAnalyticsPage } from "@/components/advanced-analytics-page";

export default function AdvancedEquitaRetributivaPage(): React.JSX.Element {
  return (
    <AdvancedAnalyticsPage
      analysisId="equita"
      title="Equità retributiva interna"
      subtitle="Spread retributivo per ruolo e centro di costo su stipendi base in anagrafica. Validare con policy retributive prima di comunicazioni ai team."
    />
  );
}
