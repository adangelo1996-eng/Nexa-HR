"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  fetchCompanySettings,
  fetchCurrentUser,
  patchCompanySettings,
  type CompanySettingsDto
} from "@/lib/api";
import { getToken, sessionCanNexaAdmin } from "@/lib/auth-session";

export default function AdminDatiAziendaPage(): React.JSX.Element {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<CompanySettingsDto | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    setError(null);
    setMsg(null);
    try {
      const me = await fetchCurrentUser(token);
      if (!sessionCanNexaAdmin(me)) {
        router.replace("/admin");
        return;
      }
      const cs = await fetchCompanySettings(token);
      setDraft(cs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento dati azienda");
      setDraft(null);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onSave(): Promise<void> {
    const token = getToken();
    if (!token || !draft) return;
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const saved = await patchCompanySettings(token, {
        companyLegalName: draft.companyLegalName,
        companyAddress: draft.companyAddress,
        companyVatNumber: draft.companyVatNumber,
        companyRegistrationInfo: draft.companyRegistrationInfo,
        companyCcnl: draft.companyCcnl,
        weeklyFullTimeHours: draft.weeklyFullTimeHours,
        payrollInstallmentMonths: draft.payrollInstallmentMonths,
        defaultCurrency: draft.defaultCurrency
      });
      setDraft(saved);
      setMsg("Dati azienda salvati. I nuovi contratti useranno questi valori in precompilazione.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2 border-b border-[var(--prom-line)] pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Amministrazione</p>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,#002D72_12%,transparent)] text-[#002D72] dark:text-sky-200">
            <Building2 className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-synapse-text dark:text-white">Dati azienda</h1>
            <p className="max-w-2xl text-sm text-synapse-muted dark:text-[#b4c9dc]">
              Anagrafica legale del datore di lavoro usata per precompilare i contratti standard e gli accordi generati
              in piattaforma.
            </p>
          </div>
        </div>
      </header>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
          {msg}
        </p>
      ) : null}

      <Card className="border-[var(--card-border)]">
        <CardHeader>
          <CardTitle className="text-base">Profilo legale</CardTitle>
          <CardDescription>
            Tenant {draft?.companyId ?? "—"}. Per anno fiscale e variabili custom vedi anche{" "}
            <Link href="/settings" className="text-[#002D72] underline dark:text-sky-200">
              Impostazioni
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">Caricamento…</p>
          ) : !draft ? (
            <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">Dati non disponibili.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-synapse-muted dark:text-[#b4c9dc]">Ragione sociale</span>
                <Input
                  value={draft.companyLegalName}
                  onChange={(e) => setDraft({ ...draft, companyLegalName: e.target.value })}
                  maxLength={240}
                  autoComplete="organization"
                />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-synapse-muted dark:text-[#b4c9dc]">Indirizzo sede legale</span>
                <Input
                  value={draft.companyAddress ?? ""}
                  onChange={(e) => setDraft({ ...draft, companyAddress: e.target.value })}
                  maxLength={400}
                  placeholder="Via, CAP, città, provincia"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-synapse-muted dark:text-[#b4c9dc]">Partita IVA</span>
                <Input
                  value={draft.companyVatNumber}
                  onChange={(e) => setDraft({ ...draft, companyVatNumber: e.target.value })}
                  maxLength={64}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-synapse-muted dark:text-[#b4c9dc]">Valuta</span>
                <Input
                  value={draft.defaultCurrency}
                  onChange={(e) =>
                    setDraft({ ...draft, defaultCurrency: e.target.value.toUpperCase().slice(0, 8) })
                  }
                  maxLength={8}
                />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-synapse-muted dark:text-[#b4c9dc]">Iscrizione REA / CCIAA / note</span>
                <Input
                  value={draft.companyRegistrationInfo}
                  onChange={(e) => setDraft({ ...draft, companyRegistrationInfo: e.target.value })}
                  maxLength={240}
                />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-synapse-muted dark:text-[#b4c9dc]">CCNL di riferimento</span>
                <Input
                  value={draft.companyCcnl}
                  onChange={(e) => setDraft({ ...draft, companyCcnl: e.target.value })}
                  maxLength={240}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-synapse-muted dark:text-[#b4c9dc]">Ore settimanali full-time</span>
                <Input
                  type="number"
                  min={1}
                  max={80}
                  value={draft.weeklyFullTimeHours}
                  onChange={(e) =>
                    setDraft({ ...draft, weeklyFullTimeHours: Number(e.target.value) || 40 })
                  }
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-synapse-muted dark:text-[#b4c9dc]">Mensilità (contratti / budget)</span>
                <select
                  value={draft.payrollInstallmentMonths}
                  onChange={(e) =>
                    setDraft({ ...draft, payrollInstallmentMonths: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--prom-surface)] px-3 py-2 text-sm text-synapse-text dark:bg-[#052642]/90 dark:text-white"
                >
                  <option value={12}>12</option>
                  <option value={13}>13</option>
                  <option value={14}>14</option>
                </select>
              </label>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void onSave()} disabled={saving || loading || !draft}>
          {saving ? "Salvataggio…" : "Salva dati azienda"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void reload()} disabled={loading}>
          Ricarica
        </Button>
        <Link
          href={"/admin/contratti" as Route}
          className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm text-[#002D72] hover:bg-[color-mix(in_srgb,#002D72_8%,transparent)] dark:text-sky-200"
        >
          Vai a Contratti →
        </Link>
      </div>
    </div>
  );
}
