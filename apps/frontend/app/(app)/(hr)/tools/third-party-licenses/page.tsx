"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createThirdPartyLicense,
  deleteThirdPartyLicense,
  fetchThirdPartyAssignments,
  fetchThirdPartyLicenses,
  patchThirdPartyLicense,
  type ThirdPartyCostFrequency,
  type ThirdPartyLicenseDto
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";

function monthlyEquivalentEurosCents(license: ThirdPartyLicenseDto): number {
  const c = license.costAmountCents;
  switch (license.costFrequency) {
    case "monthly":
      return c;
    case "annual":
      return Math.round(c / 12);
    case "one_time":
    case "other":
    default:
      return 0;
  }
}

function formatEur(cents: number): string {
  return (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

const FREQ_LABEL: Record<ThirdPartyCostFrequency, string> = {
  monthly: "Mensile",
  annual: "Annuale",
  one_time: "Una tantum",
  other: "Altro"
};

export default function ThirdPartyLicensesPage(): React.JSX.Element {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [licenses, setLicenses] = useState<ThirdPartyLicenseDto[]>([]);
  const [assignments, setAssignments] = useState<Awaited<ReturnType<typeof fetchThirdPartyAssignments>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toolFilter, setToolFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");

  const [form, setForm] = useState({
    toolName: "",
    licensePlan: "",
    seatsPurchased: 1,
    costAmountCents: 0,
    costFrequency: "monthly" as ThirdPartyCostFrequency,
    renewalDate: "",
    notes: ""
  });

  const reload = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setToken(t);
    setLoading(true);
    setError(null);
    try {
      const [li, as] = await Promise.all([fetchThirdPartyLicenses(t), fetchThirdPartyAssignments(t)]);
      setLicenses(li);
      setAssignments(as);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const assigneeOptions = useMemo(() => {
    const names = [...new Set(assignments.map((a) => a.userFullName).filter(Boolean))];
    return names.sort((a, b) => a.localeCompare(b, "it"));
  }, [assignments]);

  const assignmentsByLicense = useMemo(() => {
    const m = new Map<string, typeof assignments>();
    for (const a of assignments) {
      if (!m.has(a.licenseId)) m.set(a.licenseId, []);
      m.get(a.licenseId)!.push(a);
    }
    return m;
  }, [assignments]);

  const filteredLicenses = useMemo(() => {
    const q = toolFilter.trim().toLowerCase();
    return licenses.filter((l) => {
      if (q && !`${l.toolName} ${l.licensePlan}`.toLowerCase().includes(q)) return false;
      if (!assigneeFilter.trim()) return true;
      const subs = assignmentsByLicense.get(l.id) ?? [];
      return subs.some((s) => s.userFullName === assigneeFilter);
    });
  }, [licenses, toolFilter, assigneeFilter, assignmentsByLicense]);

  const totals = useMemo(() => {
    let monthlyCents = 0;
    let oneTimeCents = 0;
    for (const l of filteredLicenses) {
      if (l.costFrequency === "one_time") oneTimeCents += l.costAmountCents;
      else monthlyCents += monthlyEquivalentEurosCents(l);
    }
    return { monthlyCents, oneTimeCents };
  }, [filteredLicenses]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-synapse-text dark:text-white">Utenze e licenze terze</h1>
        <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">
          Inventario strumenti (es. Power BI, ChatGPT), posti acquistati, costi e assegnazioni ai dipendenti.
        </p>
        <div className="pt-2">
          <Link
            href="/admin"
            className="text-sm text-synapse-gold underline-offset-2 hover:underline dark:text-[#e8c97a]"
          >
            Torna ad Admin utenti
          </Link>
        </div>
      </header>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ricorrente (mensile stim.)</CardTitle>
            <CardDescription>Su licenze filtrate: mensili + 1/12 annuali</CardDescription>
          </CardHeader>
          <CardContent className="text-lg font-semibold text-synapse-text dark:text-white">
            {formatEur(totals.monthlyCents)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Una tantum (filtrate)</CardTitle>
            <CardDescription>Solo piano «una tantum»</CardDescription>
          </CardHeader>
          <CardContent className="text-lg font-semibold text-synapse-text dark:text-white">
            {formatEur(totals.oneTimeCents)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Licenze in elenco</CardTitle>
            <CardDescription>Dopo filtri tool / assegnatario</CardDescription>
          </CardHeader>
          <CardContent className="text-lg font-semibold text-synapse-text dark:text-white">
            {filteredLicenses.length}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtri</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs">
            <span className="text-synapse-muted dark:text-[#b4c9dc]">Tool / piano</span>
            <Input value={toolFilter} onChange={(e) => setToolFilter(e.target.value)} placeholder="Cerca…" />
          </label>
          <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs">
            <span className="text-synapse-muted dark:text-[#b4c9dc]">Assegnatario</span>
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300/90 bg-white/90 px-3 py-2 text-sm dark:border-white/15 dark:bg-[#052642]/90 dark:text-white"
            >
              <option value="">Tutti</option>
              {assigneeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" variant="secondary" className="self-end" onClick={() => void reload()} disabled={loading}>
            Aggiorna
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nuova voce catalogo</CardTitle>
          <CardDescription>Costo in euro intero o decimali: verrà salvato in centesimi.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-synapse-muted">Strumento *</span>
            <Input value={form.toolName} onChange={(e) => setForm((f) => ({ ...f, toolName: e.target.value }))} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-synapse-muted">Piano / tipo *</span>
            <Input
              value={form.licensePlan}
              onChange={(e) => setForm((f) => ({ ...f, licensePlan: e.target.value }))}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-synapse-muted">Posti acquistati *</span>
            <Input
              type="number"
              min={0}
              value={form.seatsPurchased}
              onChange={(e) => setForm((f) => ({ ...f, seatsPurchased: Number(e.target.value) }))}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-synapse-muted">Costo (EUR) *</span>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={form.costAmountCents / 100}
              onChange={(e) =>
                setForm((f) => ({ ...f, costAmountCents: Math.round(Number(e.target.value) * 100) }))
              }
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-synapse-muted">Frequenza *</span>
            <select
              value={form.costFrequency}
              onChange={(e) =>
                setForm((f) => ({ ...f, costFrequency: e.target.value as ThirdPartyCostFrequency }))
              }
              className="w-full rounded-lg border border-slate-300/90 bg-white/90 px-3 py-2 text-sm dark:border-white/15 dark:bg-[#052642]/90 dark:text-white"
            >
              {(Object.keys(FREQ_LABEL) as ThirdPartyCostFrequency[]).map((k) => (
                <option key={k} value={k}>
                  {FREQ_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-synapse-muted">Rinnovo / scadenza</span>
            <Input
              type="date"
              value={form.renewalDate}
              onChange={(e) => setForm((f) => ({ ...f, renewalDate: e.target.value }))}
            />
          </label>
          <label className="md:col-span-2 space-y-1 text-sm">
            <span className="text-synapse-muted">Note</span>
            <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </label>
          <div className="md:col-span-2">
            <Button
              type="button"
              disabled={!token || !form.toolName.trim() || !form.licensePlan.trim()}
              onClick={() => {
                if (!token) return;
                void createThirdPartyLicense(token, {
                  toolName: form.toolName.trim(),
                  licensePlan: form.licensePlan.trim(),
                  seatsPurchased: form.seatsPurchased,
                  costAmountCents: form.costAmountCents,
                  costFrequency: form.costFrequency,
                  renewalDate: form.renewalDate || undefined,
                  notes: form.notes || undefined
                })
                  .then(() => void reload())
                  .catch((e) => setError(e instanceof Error ? e.message : "Errore creazione"));
              }}
            >
              Aggiungi al catalogo
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inventario</CardTitle>
          <CardDescription>Posti attivi = assegnazioni con stato attivo. Verifica capp volumi in anagrafica utente.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-synapse-muted">Caricamento…</p>
          ) : filteredLicenses.length === 0 ? (
            <p className="text-sm text-synapse-muted">Nessuna licenza corrisponde ai filtri.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--card-border)] text-xs text-synapse-muted">
                    <th className="py-2 pr-3">Tool</th>
                    <th className="py-2 pr-3">Piano</th>
                    <th className="py-2 pr-3">Posti</th>
                    <th className="py-2 pr-3">Attivi</th>
                    <th className="py-2 pr-3">Costo</th>
                    <th className="py-2 pr-3">Assegnatari</th>
                    <th className="py-2 pr-3">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLicenses.map((l) => {
                    const subs = assignmentsByLicense.get(l.id) ?? [];
                    const overCap = l.activeSeatsCount > l.seatsPurchased && l.seatsPurchased > 0;
                    return (
                      <tr key={l.id} className="border-b border-[var(--card-border)]/70">
                        <td className="py-2 pr-3 font-medium text-synapse-text dark:text-white">{l.toolName}</td>
                        <td className="py-2 pr-3">{l.licensePlan}</td>
                        <td className="py-2 pr-3">{l.seatsPurchased}</td>
                        <td className="py-2 pr-3">
                          {l.activeSeatsCount}
                          {overCap ? (
                            <span className="ml-1 text-[10px] font-medium text-amber-700 dark:text-amber-400" title="Superato il numero posti acquistati">
                              !
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3">
                          {formatEur(l.costAmountCents)} · {FREQ_LABEL[l.costFrequency]}
                          {l.costFrequency === "annual" ? (
                            <span className="block text-[10px] text-synapse-muted">
                              ≈ {formatEur(monthlyEquivalentEurosCents(l))} / mese
                            </span>
                          ) : null}
                        </td>
                        <td className="max-w-[220px] py-2 pr-3 text-xs text-synapse-muted">
                          {subs.length === 0
                            ? "—"
                            : subs
                                .filter((s) => s.status === "active")
                                .map((s) => s.userFullName)
                                .join(", ")}
                        </td>
                        <td className="py-2 pr-3">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              const seats = window.prompt("Posti acquistati", String(l.seatsPurchased));
                              if (seats == null || !token) return;
                              void patchThirdPartyLicense(token, l.id, { seatsPurchased: Number(seats) })
                                .then(() => void reload())
                                .catch((e) => setError(e instanceof Error ? e.message : "Errore"));
                            }}
                          >
                            Posti
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="ml-1"
                            onClick={() => {
                              if (!window.confirm("Eliminare questa licenza e tutte le assegnazioni?")) return;
                              if (!token) return;
                              void deleteThirdPartyLicense(token, l.id)
                                .then(() => void reload())
                                .catch((e) => setError(e instanceof Error ? e.message : "Errore"));
                            }}
                          >
                            Elimina
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
