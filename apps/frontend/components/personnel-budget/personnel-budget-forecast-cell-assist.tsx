"use client";

import { HebbFieldAssistButton } from "@/components/hebb-field-assist";
import {
  PERSONNEL_BUDGET_FORECAST_CELL_FORM_ID,
  type PersonnelBudgetForecastMetricKey
} from "@/lib/personnel-budget-assumptions";

export function PersonnelBudgetForecastCellAssist({
  metricKey,
  year,
  month,
  userId,
  plannedLineId,
  partialForm,
  disabled,
  onSuggestValue
}: {
  metricKey: PersonnelBudgetForecastMetricKey;
  year: number;
  month: number;
  userId?: string;
  plannedLineId?: string;
  partialForm?: Record<string, unknown>;
  disabled?: boolean;
  onSuggestValue: (value: string) => void;
}): React.JSX.Element {
  return (
    <HebbFieldAssistButton
      fieldKey={`forecast.${metricKey}`}
      formId={PERSONNEL_BUDGET_FORECAST_CELL_FORM_ID}
      partialForm={partialForm}
      context={{ year, month, userId, plannedLineId, metricKey }}
      disabled={disabled}
      className="shrink-0"
      onSuggest={(res) => onSuggestValue(String(res.value ?? ""))}
    />
  );
}
