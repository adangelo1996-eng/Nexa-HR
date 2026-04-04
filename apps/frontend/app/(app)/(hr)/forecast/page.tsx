"use client";

import { useEffect, useState } from "react";
import { fetchPayrollForecast } from "@/lib/api";
import { getToken } from "@/lib/auth-session";

export default function ForecastPage(): React.JSX.Element {
  const [series, setSeries] = useState<Array<{ month: string; costEur: number }>>([]);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      return;
    }
    void (async (): Promise<void> => {
      const r = await fetchPayrollForecast(t, 3);
      setSeries(r.series);
    })();
  }, []);

  const max = Math.max(1, ...series.map((s) => s.costEur));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--prom-text)]">Forecast costi</h1>
      <div className="flex h-40 items-end gap-2">
        {series.map((s) => (
          <div key={s.month} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t bg-[color-mix(in_srgb,var(--prom-gold)_40%,transparent)] transition-[height]"
              style={{ height: `${(s.costEur / max) * 120}px` }}
              title={`${s.costEur} EUR`}
            />
            <span className="text-[10px] text-[var(--prom-muted)]">{s.month}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
