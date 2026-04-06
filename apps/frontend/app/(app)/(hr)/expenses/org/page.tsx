"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OrgExpenseClaimsAccessGate } from "@/components/org-expense-claims-access-gate";
import { fetchExpenseClaims, fetchUsers, type ExpenseClaimDto, type User } from "@/lib/api";
import { getToken, shouldClearSessionOnUnauthorizedApiError } from "@/lib/auth-session";

const EXPENSE_TYPES: { id: string; label: string }[] = [
  { id: "ristorante", label: "Ristorante / pasti" },
  { id: "autostrada", label: "Autostrada / pedaggio" },
  { id: "hotel", label: "Hotel / pernottamento" },
  { id: "carburante", label: "Carburante" },
  { id: "trasporti", label: "Trasporti (taxi, treno, volo)" },
  { id: "parcheggio", label: "Parcheggio" },
  { id: "materiale", label: "Materiale / cancelleria" },
  { id: "altro", label: "Altro" }
];

function typeLabel(id: string | undefined): string {
  return EXPENSE_TYPES.find((t) => t.id === id)?.label ?? id ?? "—";
}

function formatMoney(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

type Group = { userId: string; label: string; claims: ExpenseClaimDto[]; totalCents: number };

export default function OrgExpenseClaimsPage(): React.JSX.Element {
  const [claims, setClaims] = useState<ExpenseClaimDto[]>([]);
  const [userMap, setUserMap] = useState<Map<string, User>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<Set<string>>(() => new Set());

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      return;
    }
    try {
      const [rows, users] = await Promise.all([
        fetchExpenseClaims(token, "team"),
        fetchUsers(token)
      ]);
      setClaims(rows);
      setUserMap(new Map(users.map((u) => [u.id, u])));
      setError(null);
    } catch (e) {
      if (shouldClearSessionOnUnauthorizedApiError(e)) {
        setError("Sessione non valida. Effettua di nuovo l’accesso.");
        return;
      }
      setError("Impossibile caricare le note spese. Verifica i permessi (note spese e anagrafica).");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo((): Group[] => {
    const byUser = new Map<string, ExpenseClaimDto[]>();
    for (const c of claims) {
      if (!byUser.has(c.userId)) {
        byUser.set(c.userId, []);
      }
      byUser.get(c.userId)!.push(c);
    }
    const list: Group[] = [];
    for (const [userId, listClaims] of byUser) {
      const u = userMap.get(userId);
      const label =
        u?.fullName?.trim() ||
        [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim() ||
        u?.email ||
        userId;
      const totalCents = listClaims.reduce((s, x) => s + x.amountCents, 0);
      list.push({
        userId,
        label,
        claims: [...listClaims].sort((a, b) => (b.expenseDate ?? b.createdAt).localeCompare(a.expenseDate ?? a.createdAt)),
        totalCents
      });
    }
    list.sort((a, b) => a.label.localeCompare(b.label, "it"));
    return list;
  }, [claims, userMap]);

  function toggle(userId: string): void {
    setOpenId((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  return (
    <OrgExpenseClaimsAccessGate>
      <main className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[var(--prom-text)]">Note spese per dipendente</h1>
            <p className="mt-1 text-sm text-[var(--prom-muted)]">
              Vista organizzativa: tutte le richieste raggruppate per persona (stesso perimetro della console HR).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface)_92%,transparent)] px-3 py-2 text-sm text-[var(--prom-text)] hover:bg-[color-mix(in_srgb,var(--prom-gold)_12%,transparent)]"
              onClick={() => void load()}
            >
              Aggiorna
            </button>
            <Link
              href="/expenses"
              className="inline-flex rounded-lg border border-[var(--prom-line-strong)] px-3 py-2 text-sm text-[var(--prom-muted)] hover:text-[var(--prom-text)]"
            >
              Le mie spese
            </Link>
          </div>
        </div>

        {error ? <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p> : null}

        {groups.length === 0 && !error ? (
          <p className="text-sm text-[var(--prom-muted)]">Nessuna nota spesa in elenco.</p>
        ) : (
          <ul className="space-y-2">
            {groups.map((g) => {
              const open = openId.has(g.userId);
              return (
                <li
                  key={g.userId}
                  className="overflow-hidden rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_94%,transparent)] shadow-[var(--card-shadow)]"
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--prom-gold)_8%,transparent)]"
                    onClick={() => toggle(g.userId)}
                    aria-expanded={open}
                  >
                    {open ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-[var(--prom-muted)]" aria-hidden />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--prom-muted)]" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 font-medium text-[var(--prom-text)]">{g.label}</span>
                    <span className="shrink-0 text-sm text-[var(--prom-muted)]">
                      {g.claims.length} {g.claims.length === 1 ? "voce" : "voci"} · {formatMoney(g.totalCents, g.claims[0]?.currency ?? "EUR")}
                    </span>
                  </button>
                  {open ? (
                    <div className="border-t border-[var(--prom-line)] px-4 pb-3 pt-1">
                      <ul className="space-y-2 text-sm">
                        {g.claims.map((r) => (
                          <li
                            key={r.id}
                            className="rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)]/80 px-3 py-2"
                          >
                            <div className="font-medium text-[var(--prom-text)]">{r.description}</div>
                            <div className="mt-0.5 text-[var(--prom-muted)]">
                              {typeLabel(r.expenseType)} — {formatMoney(r.amountCents, r.currency)} — {r.status}
                              {r.expenseDate ? ` · data spesa ${r.expenseDate}` : ""}
                              {r.payslipPeriod ? ` · cedolino ${r.payslipPeriod}` : ""}
                              {r.hasReceipt ? " · scontrino" : ""}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </OrgExpenseClaimsAccessGate>
  );
}
