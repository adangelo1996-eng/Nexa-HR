"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight, FileCheck, Receipt } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OrgExpenseClaimsAccessGate } from "@/components/org-expense-claims-access-gate";
import { WorkflowExpenseFlowDiagram } from "@/components/workflow-flow-diagram";
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

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Tutti gli stati" },
  { value: "submitted", label: "In attesa responsabile" },
  { value: "pending_hr", label: "In attesa HR" },
  { value: "approved", label: "Approvata" },
  { value: "paid", label: "Pagata" },
  { value: "rejected", label: "Rifiutata" },
  { value: "draft", label: "Bozza" }
];

function typeLabel(id: string | undefined): string {
  return EXPENSE_TYPES.find((t) => t.id === id)?.label ?? id ?? "—";
}

function formatMoney(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function userDisplay(u: User | undefined, fallbackId: string): string {
  if (!u) {
    return fallbackId;
  }
  return (
    u.fullName?.trim() ||
    [u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
    u.email ||
    fallbackId
  );
}

function managerLabelForClaim(claim: ExpenseClaimDto, userMap: Map<string, User>): string | null {
  const u = userMap.get(claim.userId);
  if (!u?.managerId) {
    return null;
  }
  return userDisplay(userMap.get(u.managerId), u.managerId);
}

function statusBadgeClass(status: string): string {
  if (status === "approved") {
    return "bg-emerald-100/90 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200";
  }
  if (status === "paid") {
    return "bg-sky-100/90 text-sky-900 dark:bg-sky-900/45 dark:text-sky-100";
  }
  if (status === "rejected") {
    return "bg-rose-100/90 text-rose-900 dark:bg-rose-900/50 dark:text-rose-200";
  }
  if (status === "submitted") {
    return "bg-amber-100/90 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100";
  }
  if (status === "pending_hr") {
    return "bg-violet-100/90 text-violet-900 dark:bg-violet-900/45 dark:text-violet-100";
  }
  if (status === "draft") {
    return "bg-[color-mix(in_srgb,var(--prom-muted)_22%,transparent)] text-[var(--prom-text)]";
  }
  return "bg-[color-mix(in_srgb,var(--prom-muted)_25%,transparent)] text-[var(--prom-text)]";
}

function statusLabelIt(status: string): string {
  const f = STATUS_FILTERS.find((x) => x.value === status);
  return f?.label ?? status;
}

function claimSortKey(c: ExpenseClaimDto): string {
  return c.expenseDate ?? c.createdAt;
}

function inDateRange(isoDate: string | undefined, from: string, to: string): boolean {
  if (!from && !to) {
    return true;
  }
  if (!isoDate) {
    return false;
  }
  if (from && isoDate < from) {
    return false;
  }
  if (to && isoDate > to) {
    return false;
  }
  return true;
}

type Group = { userId: string; label: string; claims: ExpenseClaimDto[]; totalCents: number };

export default function OrgExpenseClaimsPage(): React.JSX.Element {
  const [claims, setClaims] = useState<ExpenseClaimDto[]>([]);
  const [userMap, setUserMap] = useState<Map<string, User>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<Set<string>>(() => new Set());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [periodFrom, setPeriodFrom] = useState<string>("");
  const [periodTo, setPeriodTo] = useState<string>("");
  const [query, setQuery] = useState<string>("");

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

  const filteredClaims = useMemo((): ExpenseClaimDto[] => {
    const q = query.trim().toLowerCase();
    return claims.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) {
        return false;
      }
      const ref = c.expenseDate ?? c.createdAt.slice(0, 10);
      if (!inDateRange(ref, periodFrom, periodTo)) {
        return false;
      }
      if (q) {
        const emp = userDisplay(userMap.get(c.userId), c.userId).toLowerCase();
        const desc = (c.description ?? "").toLowerCase();
        const typ = typeLabel(c.expenseType).toLowerCase();
        if (!desc.includes(q) && !typ.includes(q) && !emp.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [claims, statusFilter, periodFrom, periodTo, query, userMap]);

  const groups = useMemo((): Group[] => {
    const byUser = new Map<string, ExpenseClaimDto[]>();
    for (const c of filteredClaims) {
      if (!byUser.has(c.userId)) {
        byUser.set(c.userId, []);
      }
      byUser.get(c.userId)!.push(c);
    }
    const list: Group[] = [];
    for (const [userId, listClaims] of byUser) {
      const label = userDisplay(userMap.get(userId), userId);
      const totalCents = listClaims.reduce((s, x) => s + x.amountCents, 0);
      list.push({
        userId,
        label,
        claims: [...listClaims].sort((a, b) => claimSortKey(b).localeCompare(claimSortKey(a))),
        totalCents
      });
    }
    list.sort((a, b) => a.label.localeCompare(b.label, "it"));
    return list;
  }, [filteredClaims, userMap]);

  const statusSummary = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of claims) {
      m.set(c.status, (m.get(c.status) ?? 0) + 1);
    }
    return m;
  }, [claims]);

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

  function expandAll(): void {
    setOpenId(new Set(groups.map((g) => g.userId)));
  }

  function collapseAll(): void {
    setOpenId(new Set());
  }

  return (
    <OrgExpenseClaimsAccessGate>
      <main className="mx-auto max-w-5xl space-y-6 pb-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[var(--prom-text)]">Note spese — organico</h1>
            <p className="mt-1 text-sm text-[var(--prom-muted)]">
              Filtri, stato pipeline e dettaglio per dipendente (stesso perimetro della console HR).
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
            <Link
              href="/workflow/approvals"
              className="inline-flex rounded-lg border border-[var(--prom-line-strong)] px-3 py-2 text-sm text-[var(--prom-muted)] hover:text-[var(--prom-text)]"
            >
              Workflow approvazioni
            </Link>
          </div>
        </div>

        {error ? (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <section className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] p-4 shadow-[var(--card-shadow)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-[var(--prom-muted)]">
              Stato
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-3 py-2 text-sm text-[var(--prom-text)]"
              >
                {STATUS_FILTERS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[9rem] flex-col gap-1 text-xs font-medium text-[var(--prom-muted)]">
              Data spesa da
              <input
                type="date"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
                className="rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-3 py-2 text-sm text-[var(--prom-text)]"
              />
            </label>
            <label className="flex min-w-[9rem] flex-col gap-1 text-xs font-medium text-[var(--prom-muted)]">
              Data spesa a
              <input
                type="date"
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
                className="rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-3 py-2 text-sm text-[var(--prom-text)]"
              />
            </label>
            <label className="flex min-w-[12rem] flex-[2] flex-col gap-1 text-xs font-medium text-[var(--prom-muted)]">
              Cerca (dipendente, descrizione, tipo)
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Es. Mario, taxi, hotel…"
                className="rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)] px-3 py-2 text-sm text-[var(--prom-text)] placeholder:text-[var(--prom-muted)]"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--prom-line)] pt-3">
            <span className="text-xs text-[var(--prom-muted)]">Totale caricato:</span>
            {STATUS_FILTERS.filter((x) => x.value !== "all").map((s) => {
              const n = statusSummary.get(s.value) ?? 0;
              if (n === 0) {
                return null;
              }
              return (
                <span
                  key={s.value}
                  className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(s.value)}`}
                >
                  {s.label}: {n}
                </span>
              );
            })}
            {claims.length === 0 ? (
              <span className="text-xs text-[var(--prom-muted)]">nessuna voce</span>
            ) : null}
            <button
              type="button"
              className="ml-auto text-xs text-[var(--prom-muted)] underline decoration-dotted hover:text-[var(--prom-text)]"
              onClick={expandAll}
            >
              Espandi tutti
            </button>
            <button
              type="button"
              className="text-xs text-[var(--prom-muted)] underline decoration-dotted hover:text-[var(--prom-text)]"
              onClick={collapseAll}
            >
              Comprimi tutti
            </button>
          </div>
        </section>

        {groups.length === 0 && !error ? (
          <p className="text-sm text-[var(--prom-muted)]">
            {claims.length === 0 ? "Nessuna nota spesa in elenco." : "Nessun risultato con i filtri correnti."}
          </p>
        ) : (
          <ul className="space-y-3">
            {groups.map((g) => {
              const open = openId.has(g.userId);
              const currency = g.claims[0]?.currency ?? "EUR";
              return (
                <li
                  key={g.userId}
                  className="overflow-hidden rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_94%,transparent)] shadow-[var(--card-shadow)]"
                >
                  <div className="sticky top-0 z-[1] border-b border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_96%,var(--prom-surface))] backdrop-blur-sm">
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
                      <span className="min-w-0 flex-1 font-semibold text-[var(--prom-text)]">{g.label}</span>
                      <span className="hidden shrink-0 text-xs text-[var(--prom-muted)] sm:inline">
                        Subtotale filtrato
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-[var(--prom-text)]">
                        {formatMoney(g.totalCents, currency)}
                      </span>
                      <span className="shrink-0 text-sm text-[var(--prom-muted)]">
                        {g.claims.length} {g.claims.length === 1 ? "voce" : "voci"}
                      </span>
                    </button>
                  </div>
                  {open ? (
                    <div className="px-3 pb-3 pt-2 sm:px-4">
                      <div className="hidden overflow-x-auto md:block">
                        <table className="w-full min-w-[640px] border-collapse text-sm">
                          <thead>
                            <tr className="text-left text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">
                              <th className="border-b border-[var(--prom-line)] py-2 pr-3">Data</th>
                              <th className="border-b border-[var(--prom-line)] py-2 pr-3">Tipo</th>
                              <th className="border-b border-[var(--prom-line)] py-2 pr-3 text-right">Importo</th>
                              <th className="border-b border-[var(--prom-line)] py-2 pr-3">Stato</th>
                              <th className="border-b border-[var(--prom-line)] py-2 pr-3">Scontrino</th>
                              <th className="border-b border-[var(--prom-line)] py-2">Nota</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.claims.map((r) => (
                              <tr key={r.id} className="align-top text-[var(--prom-text)]">
                                <td className="border-b border-[var(--prom-line)] py-3 pr-3 tabular-nums text-[var(--prom-muted)]">
                                  {r.expenseDate ?? "—"}
                                </td>
                                <td className="border-b border-[var(--prom-line)] py-3 pr-3 text-[var(--prom-muted)]">
                                  {typeLabel(r.expenseType)}
                                </td>
                                <td className="border-b border-[var(--prom-line)] py-3 pr-3 text-right font-medium tabular-nums">
                                  {formatMoney(r.amountCents, r.currency)}
                                </td>
                                <td className="border-b border-[var(--prom-line)] py-3 pr-3">
                                  <span
                                    className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(r.status)}`}
                                  >
                                    {statusLabelIt(r.status)}
                                  </span>
                                </td>
                                <td className="border-b border-[var(--prom-line)] py-3 pr-3 text-[var(--prom-muted)]">
                                  {r.hasReceipt ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                                      <Receipt className="h-3.5 w-3.5" aria-hidden />
                                      Sì
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 opacity-70">
                                      <FileCheck className="h-3.5 w-3.5" aria-hidden />
                                      No
                                    </span>
                                  )}
                                </td>
                                <td className="border-b border-[var(--prom-line)] py-3">
                                  <p className="max-w-[14rem] font-medium leading-snug">{r.description}</p>
                                  {r.payslipPeriod ? (
                                    <p className="mt-1 text-xs text-[var(--prom-muted)]">
                                      Cedolino: {r.payslipPeriod}
                                    </p>
                                  ) : null}
                                  <WorkflowExpenseFlowDiagram
                                    claim={r}
                                    requesterLabel={g.label}
                                    managerLabel={managerLabelForClaim(r, userMap)}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <ul className="space-y-3 md:hidden">
                        {g.claims.map((r) => (
                          <li
                            key={r.id}
                            className="rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface)]/85 p-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="font-medium text-[var(--prom-text)]">{r.description}</p>
                                <p className="mt-0.5 text-xs text-[var(--prom-muted)]">
                                  {typeLabel(r.expenseType)}
                                  {r.expenseDate ? ` · ${r.expenseDate}` : ""}
                                </p>
                              </div>
                              <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--prom-text)]">
                                {formatMoney(r.amountCents, r.currency)}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(r.status)}`}
                              >
                                {statusLabelIt(r.status)}
                              </span>
                              <span className="text-xs text-[var(--prom-muted)]">
                                {r.hasReceipt ? "Scontrino caricato" : "Nessuno scontrino"}
                              </span>
                              {r.payslipPeriod ? (
                                <span className="text-xs text-[var(--prom-muted)]">Ced. {r.payslipPeriod}</span>
                              ) : null}
                            </div>
                            <WorkflowExpenseFlowDiagram
                              claim={r}
                              requesterLabel={g.label}
                              managerLabel={managerLabelForClaim(r, userMap)}
                            />
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
