"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import type { ActivityTemplateId, TenantPack } from "@payday/domain";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  applyTenantPack,
  fetchCurrentUser,
  fetchTenantPack,
  type TenantPackCurrentResponse
} from "@/lib/api";
import { getToken, sessionCanNexaAdmin } from "@/lib/auth-session";

export default function AdminPacchettoPage(): React.JSX.Element {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [data, setData] = useState<TenantPackCurrentResponse | null>(null);
  const [selected, setSelected] = useState<ActivityTemplateId>("full_suite");
  const [modules, setModules] = useState<Record<string, boolean>>({});

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
      const current = await fetchTenantPack(token);
      setData(current);
      setSelected(current.pack.templateId);
      setModules({ ...current.pack.modules });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento pacchetto");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const optionalCaps = useMemo(
    () => (data?.catalog.capabilities ?? []).filter((c) => c.kind === "optional"),
    [data]
  );

  async function onApply(): Promise<void> {
    const token = getToken();
    if (!token) return;
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      await applyTenantPack(token, { templateId: selected, modules });
      await fetchCurrentUser(token, { fresh: true });
      await reload();
      setMsg("Pacchetto applicato. I moduli spenti spariscono da menu e API, senza fork di codice.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore applicazione template");
    } finally {
      setSaving(false);
    }
  }

  const pack: TenantPack | null = data?.pack ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2 border-b border-[var(--prom-line)] pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Amministrazione</p>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,#002D72_12%,transparent)] text-[#002D72] dark:text-sky-200">
            <LayoutDashboard className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-synapse-text dark:text-white">Pacchetto standard</h1>
            <p className="max-w-2xl text-sm text-synapse-muted dark:text-[#b4c9dc]">
              Un cliente nuovo si configura da un template di attività. Nexa HR e Plasticity condividono lo stesso
              contratto: moduli, limiti, default. Niente fork.
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

      {loading || !data || !pack ? (
        <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">{loading ? "Caricamento…" : "Dati non disponibili."}</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Varianti supportate</CardTitle>
              <CardDescription>
                Tenant {data.companyId}. Attuale: <strong>{pack.activityLabelIt}</strong> ({pack.sectorLabelIt}).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {data.catalog.templates.map((t) => (
                <label
                  key={t.id}
                  className={`cursor-pointer rounded-xl border p-3 text-sm ${
                    selected === t.id
                      ? "border-[#002D72] bg-[color-mix(in_srgb,#002D72_8%,transparent)]"
                      : "border-[var(--card-border)]"
                  }`}
                >
                  <input
                    type="radio"
                    className="mr-2"
                    name="activity-template"
                    checked={selected === t.id}
                    onChange={() => {
                      setSelected(t.id);
                      const next: Record<string, boolean> = { ...modules };
                      for (const cap of optionalCaps) {
                        next[cap.id] = t.enabledOptional.includes(cap.id);
                      }
                      setModules(next);
                    }}
                  />
                  <span className="font-medium text-synapse-text dark:text-white">{t.labelIt}</span>
                  <p className="mt-1 text-xs text-synapse-muted dark:text-[#b4c9dc]">{t.summaryIt}</p>
                </label>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Moduli opzionali</CardTitle>
              <CardDescription>
                Sempre accesi: anagrafiche, presenze, ferie, organigramma, documenti, SSO. Qui si cucie il resto.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {optionalCaps.map((cap) => (
                <label key={cap.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={modules[cap.id] === true}
                    onChange={(e) => setModules((prev) => ({ ...prev, [cap.id]: e.target.checked }))}
                  />
                  <span>
                    <span className="font-medium text-synapse-text dark:text-white">{cap.labelIt}</span>
                    <span className="ml-1 text-[11px] uppercase text-synapse-muted">{cap.product}</span>
                    <p className="text-xs text-synapse-muted dark:text-[#b4c9dc]">{cap.descriptionIt}</p>
                  </span>
                </label>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Limiti e default</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-synapse-text dark:text-white sm:grid-cols-3">
              <p>Dipendenti max: {pack.limits.maxEmployees}</p>
              <p>Seat HR max: {pack.limits.maxHrSeats}</p>
              <p>Dataset BI max: {pack.limits.plasticityMaxDatasets}</p>
              <p>Ore/sett.: {pack.defaults.weeklyFullTimeHours}</p>
              <p>Valuta: {pack.defaults.currency}</p>
              <p>Payroll: {pack.defaults.payrollCountry}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cosa è custom</CardTitle>
              <CardDescription>Si personalizza per configurazione. Il codice resta unico.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-synapse-muted">Senza codice</p>
                <ul className="list-disc space-y-1 pl-4 text-sm text-synapse-text dark:text-white">
                  {data.catalog.customPolicy.configurableWithoutCode.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-synapse-muted">Richiede eccezione</p>
                <ul className="list-disc space-y-1 pl-4 text-sm text-synapse-text dark:text-white">
                  {data.catalog.customPolicy.requiresCustomException.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void onApply()} disabled={saving || loading}>
              {saving ? "Applicazione…" : "Applica template"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void reload()} disabled={loading}>
              Ricarica
            </Button>
            <Link
              href={"/admin/dati-azienda" as Route}
              className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm text-[#002D72] hover:bg-[color-mix(in_srgb,#002D72_8%,transparent)] dark:text-sky-200"
            >
              Dati azienda →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
