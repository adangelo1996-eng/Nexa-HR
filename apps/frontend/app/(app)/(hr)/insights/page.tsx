"use client";

import { useEffect, useState } from "react";
import { fetchPeopleInsights } from "@/lib/api";
import { getToken } from "@/lib/auth-session";

export default function InsightsPage(): React.JSX.Element {
  const [items, setItems] = useState<Array<{ userId: string; fullName: string; score: number; reasons: string[] }>>([]);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      return;
    }
    void (async (): Promise<void> => {
      const res = await fetchPeopleInsights(t);
      setItems(res.items.slice(0, 25));
    })();
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--prom-text)]">People risk</h1>
      <ul className="space-y-2">
        {items.map((row) => (
          <li key={row.userId} className="rounded-lg border border-[var(--prom-line)] p-4">
            <div className="flex justify-between gap-2">
              <span className="font-medium text-[var(--prom-text)]">{row.fullName}</span>
              <span className="tabular-nums text-[var(--prom-gold)]">{row.score}</span>
            </div>
            <ul className="mt-2 list-inside list-disc text-xs text-[var(--prom-muted)]">
              {row.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
