"use client";

import { useEffect, useState } from "react";
import { fetchShiftProposals, fetchCurrentUser } from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";

export default function SchedulingPage(): React.JSX.Element {
  const [week, setWeek] = useState(() => new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);

  async function load(): Promise<void> {
    const token = getToken();
    if (!token) {
      return;
    }
    await fetchCurrentUser(token);
    const res = await fetchShiftProposals(token, week);
    setItems(res.items as Array<Record<string, unknown>>);
  }

  useEffect(() => {
    void load();
  }, [week]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--prom-text)]">Turni — proposte</h1>
      <input type="date" value={week} onChange={(e) => setWeek(e.target.value)} className="rounded border border-[var(--prom-line)] bg-transparent px-2 py-1 text-sm" />
      <Button type="button" size="sm" className="ml-2" onClick={() => void load()}>
        Rigenera
      </Button>
      <ul className="space-y-2 text-sm">
        {items.map((it) => (
          <li key={String(it.id)} className="rounded border border-[var(--prom-line)] px-3 py-2 text-[var(--prom-text)]">
            {String(it.userId)} · {String(it.startAt)} → {String(it.endAt)}
          </li>
        ))}
      </ul>
    </div>
  );
}
