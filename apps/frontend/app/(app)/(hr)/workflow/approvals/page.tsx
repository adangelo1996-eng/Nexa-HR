"use client";

import { useCallback, useEffect, useState } from "react";
import {
  approveApproval,
  approveSmartworkingRequest,
  fetchApprovals,
  fetchSmartworkingPending,
  rejectApproval,
  rejectSmartworkingRequest,
  type ApprovalItem,
  type SmartworkingRequestDto
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { subscribePostgresTable } from "@/lib/supabase-realtime";
import { Button } from "@/components/ui/button";

export default function WorkflowApprovalsPage(): React.JSX.Element {
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [sw, setSw] = useState<SmartworkingRequestDto[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      return;
    }
    setLoading(true);
    try {
      const [a, p] = await Promise.all([
        fetchApprovals(token, "pending"),
        fetchSmartworkingPending(token).catch(() => [] as SmartworkingRequestDto[])
      ]);
      setApprovals(a);
      setSw(p);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const a = subscribePostgresTable("approvals", () => void load());
    const s = subscribePostgresTable("smartworking_requests", () => void load());
    return (): void => {
      a.unsubscribe();
      s.unsubscribe();
    };
  }, [load]);

  async function onApproveA(id: string): Promise<void> {
    const token = getToken();
    if (!token) {
      return;
    }
    await approveApproval(token, id);
    void load();
  }

  async function onRejectA(id: string): Promise<void> {
    const token = getToken();
    if (!token) {
      return;
    }
    await rejectApproval(token, id, { reason: reasons[id] || undefined });
    void load();
  }

  async function onApproveSw(id: string): Promise<void> {
    const token = getToken();
    if (!token) {
      return;
    }
    await approveSmartworkingRequest(token, id);
    void load();
  }

  async function onRejectSw(id: string): Promise<void> {
    const token = getToken();
    if (!token) {
      return;
    }
    await rejectSmartworkingRequest(token, id, reasons[id] || undefined);
    void load();
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-xl font-semibold text-[var(--prom-text)]">Approvazioni</h1>
        <p className="text-sm text-[var(--prom-muted)]">Ferie, malattia, smartworking</p>
      </header>
      {loading ? <p className="text-sm text-[var(--prom-muted)]">Caricamento…</p> : null}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-[var(--prom-text)]">Workflow standard</h2>
        {approvals.length === 0 ? (
          <p className="text-sm text-[var(--prom-muted)]">Nessuna richiesta.</p>
        ) : (
          <ul className="space-y-3">
            {approvals.map((item) => (
              <li key={item.id} className="rounded-lg border border-[var(--prom-line)] p-4">
                <p className="font-medium text-[var(--prom-text)]">
                  {item.type === "leave" ? "Ferie" : "Malattia"} · {item.requesterName ?? item.requestedBy}
                </p>
                {item.startDate && item.endDate ? (
                  <p className="text-xs text-[var(--prom-muted)]">
                    {item.startDate} → {item.endDate}
                  </p>
                ) : null}
                <input
                  placeholder="Motivo rifiuto (opz.)"
                  value={reasons[item.id] ?? ""}
                  onChange={(e) => setReasons((r) => ({ ...r, [item.id]: e.target.value }))}
                  className="mt-2 w-full max-w-md rounded border border-[var(--prom-line)] bg-transparent px-2 py-1 text-sm text-[var(--prom-text)]"
                />
                <div className="mt-2 flex gap-2">
                  <Button type="button" size="sm" onClick={() => void onApproveA(item.id)}>
                    Approva
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => void onRejectA(item.id)}>
                    Rifiuta
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-[var(--prom-text)]">Smartworking</h2>
        {sw.length === 0 ? (
          <p className="text-sm text-[var(--prom-muted)]">Nessuna richiesta SW.</p>
        ) : (
          <ul className="space-y-3">
            {sw.map((item) => (
              <li key={item.id} className="rounded-lg border border-[var(--prom-line)] p-4">
                <p className="font-medium text-[var(--prom-text)]">
                  {item.userId} · {item.day}
                </p>
                {item.note ? <p className="text-xs text-[var(--prom-muted)]">{item.note}</p> : null}
                <input
                  placeholder="Motivo rifiuto (opz.)"
                  value={reasons[item.id] ?? ""}
                  onChange={(e) => setReasons((r) => ({ ...r, [item.id]: e.target.value }))}
                  className="mt-2 w-full max-w-md rounded border border-[var(--prom-line)] bg-transparent px-2 py-1 text-sm text-[var(--prom-text)]"
                />
                <div className="mt-2 flex gap-2">
                  <Button type="button" size="sm" onClick={() => void onApproveSw(item.id)}>
                    Approva
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => void onRejectSw(item.id)}>
                    Rifiuta
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
