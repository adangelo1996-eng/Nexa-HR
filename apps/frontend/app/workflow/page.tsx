"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  approveApproval,
  fetchApprovals,
  fetchCurrentUser,
  rejectApproval,
  type ApprovalItem
} from "@/lib/api";
import { clearSession, getToken, type SessionUser } from "@/lib/auth-session";

type StatusFilter = "all" | "pending" | "approved" | "rejected";

export default function WorkflowPage(): React.JSX.Element {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const currentToken = getToken();
    if (!currentToken) {
      router.replace("/login");
      return;
    }
    const tokenValue = currentToken;
    setToken(tokenValue);

    async function load(): Promise<void> {
      try {
        const me = await fetchCurrentUser(tokenValue);
        if (me.role === "employee") {
          router.replace("/");
          return;
        }
        const list = await fetchApprovals(tokenValue);
        setUser(me);
        setApprovals(list);
      } catch (loadError) {
        clearSession();
        router.replace("/login");
        setError(loadError instanceof Error ? loadError.message : "Errore caricamento workflow");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [router]);

  async function refresh(selectedFilter: StatusFilter = filter): Promise<void> {
    if (!token) {
      return;
    }
    const list = await fetchApprovals(token, selectedFilter === "all" ? undefined : selectedFilter);
    setApprovals(list);
  }

  async function onAction(approvalId: string, action: "approve" | "reject"): Promise<void> {
    if (!token) {
      return;
    }
    setBusyId(approvalId);
    setError(null);
    try {
      if (action === "approve") {
        await approveApproval(token, approvalId);
      } else {
        await rejectApproval(token, approvalId);
      }
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore aggiornamento autorizzazione");
    } finally {
      setBusyId(null);
    }
  }

  async function onFilterChange(nextFilter: StatusFilter): Promise<void> {
    setFilter(nextFilter);
    await refresh(nextFilter);
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <p className="text-slate-300">Caricamento workflow...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workflow autorizzazioni</h1>
          <p className="text-sm text-slate-400">
            Vista di richieste dei sottoposti per {user?.fullName} ({user?.role}).
          </p>
        </div>
        <Link href="/" className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800">
          Torna alla dashboard
        </Link>
      </header>

      <section className="card">
        <div className="flex flex-wrap gap-2">
          {(["all", "pending", "approved", "rejected"] as const).map((item) => (
            <Button
              key={item}
              variant={filter === item ? "primary" : "secondary"}
              size="sm"
              onClick={() => void onFilterChange(item)}
            >
              {item}
            </Button>
          ))}
        </div>
        <div className="mt-4 space-y-3">
          {approvals.length === 0 ? <p className="text-sm text-slate-400">Nessuna autorizzazione disponibile.</p> : null}
          {approvals.map((item) => (
            <article key={item.id} className="rounded-lg border border-slate-700 p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">{item.type === "leave" ? "Richiesta ferie" : "Richiesta malattia"}</p>
                <span
                  className={`rounded px-2 py-1 text-xs ${
                    item.status === "approved"
                      ? "bg-emerald-900/60 text-emerald-200"
                      : item.status === "rejected"
                        ? "bg-rose-900/60 text-rose-200"
                        : "bg-amber-900/60 text-amber-200"
                  }`}
                >
                  {item.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">Richiedente: {item.requestedBy}</p>
              <p className="text-xs text-slate-500">{new Date(item.at).toLocaleString("it-CH")}</p>
              {item.status === "pending" ? (
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => void onAction(item.id, "approve")}
                    disabled={busyId === item.id}
                    className="bg-emerald-400 text-slate-900 hover:bg-emerald-300"
                  >
                    Approva
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void onAction(item.id, "reject")}
                    disabled={busyId === item.id}
                    className="bg-rose-300 text-slate-900 hover:bg-rose-200"
                  >
                    Nega
                  </Button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      </section>
    </main>
  );
}
