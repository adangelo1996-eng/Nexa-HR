"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchHrOnboardingWizard,
  fetchTrainingCourses,
  saveHrOnboardingWizardStep,
  uploadDocumentToVault,
  type HrOnboardingWizardDto,
  type TrainingCourseDto
} from "@/lib/api";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Lettura file fallita"));
    reader.readAsDataURL(file);
  });
}

type Props = {
  token: string;
  userId: string;
  employeeName: string;
};

export function HrOnboardingWizardPanel({ token, userId, employeeName }: Props): React.JSX.Element {
  const [wizard, setWizard] = useState<HrOnboardingWizardDto | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [courses, setCourses] = useState<TrainingCourseDto[]>([]);
  const [form, setForm] = useState<Record<string, unknown>>({});

  const steps = wizard?.stepDefinitions ?? [];
  const current = steps[stepIndex];
  const currentKey = current?.key ?? "";
  const progressPct = steps.length > 0 ? Math.round(((stepIndex + 1) / steps.length) * 100) : 0;

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [w, catalog] = await Promise.all([
        fetchHrOnboardingWizard(token, userId),
        fetchTrainingCourses(token).catch(() => ({ items: [] as TrainingCourseDto[] }))
      ]);
      setWizard(w);
      setStepIndex(w.currentStepIndex);
      setCourses(catalog.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento wizard");
    } finally {
      setLoading(false);
    }
  }, [token, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!wizard || !currentKey) return;
    setForm(wizard.steps[currentKey]?.data ?? {});
  }, [wizard, currentKey]);

  const selectedCourseIds = useMemo(() => {
    const raw = form.courseIds;
    return Array.isArray(raw) ? raw.map(String) : [];
  }, [form.courseIds]);

  async function persist(markDone: boolean): Promise<void> {
    if (!currentKey) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await saveHrOnboardingWizardStep(token, userId, {
        stepKey: currentKey,
        data: form,
        markDone
      });
      setWizard(updated);
      if (markDone && stepIndex < steps.length - 1) {
        setStepIndex(stepIndex + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Salvataggio non riuscito");
    } finally {
      setSaving(false);
    }
  }

  async function onUploadDoc(file: File, title: string): Promise<void> {
    const b64 = await fileToBase64(file);
    await uploadDocumentToVault(token, {
      title,
      kind: "personal",
      mimeType: file.type || "application/octet-stream",
      bodyBase64: b64,
      targetUserId: userId
    });
    const uploaded = Array.isArray(form.uploadedTitles) ? [...(form.uploadedTitles as string[])] : [];
    uploaded.push(title);
    setForm({ ...form, uploadedTitles: uploaded });
  }

  if (loading || !wizard || !current) {
    return <p className="text-sm text-synapse-muted">Caricamento wizard onboarding…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-synapse-muted">Onboarding HR</p>
          <h2 className="text-lg font-semibold text-synapse-text dark:text-white">{employeeName}</h2>
        </div>
        <Link
          href={"/percorso" as Route}
          className="text-xs text-[#002D72] underline-offset-2 hover:underline dark:text-sky-200"
        >
          Percorso dipendente →
        </Link>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs text-synapse-muted">
          <span>
            Passo {stepIndex + 1} di {steps.length}: {current.titleIt}
          </span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className="h-full rounded-full bg-[#002D72] transition-all dark:bg-sky-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <ol className="flex flex-wrap gap-1">
          {steps.map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => setStepIndex(i)}
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  i === stepIndex
                    ? "bg-[#002D72] text-white dark:bg-sky-500"
                    : wizard.steps[s.key]?.done
                      ? "bg-emerald-600/20 text-emerald-800 dark:text-emerald-200"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {i + 1}
              </button>
            </li>
          ))}
        </ol>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <Card className="border-[var(--card-border)]">
        <CardHeader>
          <CardTitle className="text-base">{current.titleIt}</CardTitle>
          <CardDescription>{current.descriptionIt}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentKey === "anagrafica_contratto" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["firstName", "Nome"],
                  ["lastName", "Cognome"],
                  ["email", "Email"],
                  ["phone", "Telefono"],
                  ["fiscalCode", "Codice fiscale"],
                  ["hireDate", "Data assunzione"],
                  ["contractType", "Tipo contratto"]
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-sm">
                  <span className="text-synapse-muted">{label}</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm dark:bg-[#052642]"
                    value={String(form[key] ?? "")}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
          ) : null}

          {currentKey === "documenti" ? (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="text-synapse-muted">Carica documento (PDF, immagine)</span>
                <input
                  type="file"
                  className="mt-1 w-full text-sm"
                  accept=".pdf,image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      void onUploadDoc(f, f.name).catch((err) =>
                        setError(err instanceof Error ? err.message : "Upload fallito")
                      );
                    }
                    e.target.value = "";
                  }}
                />
              </label>
              <ul className="text-xs text-synapse-muted">
                {(Array.isArray(form.uploadedTitles) ? (form.uploadedTitles as string[]) : []).map((t) => (
                  <li key={t}>✓ {t}</li>
                ))}
              </ul>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(form.docsComplete)}
                  onChange={(e) => setForm({ ...form, docsComplete: e.target.checked })}
                />
                Documentazione obbligatoria completa
              </label>
            </div>
          ) : null}

          {currentKey === "accessi_it" ? (
            <div className="grid gap-2 text-sm">
              {["accountEmail", "adGroups", "vpn", "mfa"].map((key) => (
                <label key={key} className="block">
                  <span className="text-synapse-muted capitalize">{key}</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-[var(--card-border)] px-3 py-2 dark:bg-[#052642]"
                    value={String(form[key] ?? "")}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
          ) : null}

          {currentKey === "badge" ? (
            <div className="grid gap-2 text-sm">
              <label className="block">
                <span className="text-synapse-muted">Numero badge</span>
                <input
                  className="mt-1 w-full rounded-lg border border-[var(--card-border)] px-3 py-2 dark:bg-[#052642]"
                  value={String(form.badgeNumber ?? "")}
                  onChange={(e) => setForm({ ...form, badgeNumber: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-synapse-muted">Accessi sede</span>
                <input
                  className="mt-1 w-full rounded-lg border border-[var(--card-border)] px-3 py-2 dark:bg-[#052642]"
                  value={String(form.siteAccess ?? "")}
                  onChange={(e) => setForm({ ...form, siteAccess: e.target.value })}
                />
              </label>
            </div>
          ) : null}

          {currentKey === "policy" ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(form.policiesSigned)}
                onChange={(e) => setForm({ ...form, policiesSigned: e.target.checked })}
              />
              <span>Confermo che il dipendente ha letto e firmato policy interne, privacy e sicurezza.</span>
            </label>
          ) : null}

          {currentKey === "equipment" ? (
            <textarea
              className="min-h-[100px] w-full rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm dark:bg-[#052642]"
              placeholder="PC, monitor, telefono, accessori…"
              value={String(form.equipmentNotes ?? "")}
              onChange={(e) => setForm({ ...form, equipmentNotes: e.target.value })}
            />
          ) : null}

          {currentKey === "primo_giorno" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-synapse-muted">Data primo giorno</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-[var(--card-border)] px-3 py-2 dark:bg-[#052642]"
                  value={String(form.firstDayDate ?? "")}
                  onChange={(e) => setForm({ ...form, firstDayDate: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="text-synapse-muted">Orario ingresso</span>
                <input
                  type="time"
                  className="mt-1 w-full rounded-lg border border-[var(--card-border)] px-3 py-2 dark:bg-[#052642]"
                  value={String(form.firstDayTime ?? "09:00")}
                  onChange={(e) => setForm({ ...form, firstDayTime: e.target.value })}
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-synapse-muted">Sede / punto di ritrovo</span>
                <input
                  className="mt-1 w-full rounded-lg border border-[var(--card-border)] px-3 py-2 dark:bg-[#052642]"
                  value={String(form.firstDayLocation ?? "")}
                  onChange={(e) => setForm({ ...form, firstDayLocation: e.target.value })}
                />
              </label>
            </div>
          ) : null}

          {currentKey === "buddy_formazione" ? (
            <div className="space-y-4">
              <label className="block text-sm">
                <span className="text-synapse-muted">Buddy assegnato (nome o ID)</span>
                <input
                  className="mt-1 w-full rounded-lg border border-[var(--card-border)] px-3 py-2 dark:bg-[#052642]"
                  value={String(form.buddyName ?? "")}
                  onChange={(e) => setForm({ ...form, buddyName: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="text-synapse-muted">Scadenza corsi</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-[var(--card-border)] px-3 py-2 dark:bg-[#052642]"
                  value={String(form.trainingDueDate ?? "")}
                  onChange={(e) => setForm({ ...form, trainingDueDate: e.target.value })}
                />
              </label>
              <div>
                <p className="mb-2 text-sm font-medium text-synapse-text dark:text-white">Corsi da assegnare</p>
                <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
                  {courses.map((c) => (
                    <li key={c.id}>
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={selectedCourseIds.includes(c.id)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...selectedCourseIds, c.id]
                              : selectedCourseIds.filter((id) => id !== c.id);
                            setForm({ ...form, courseIds: next });
                          }}
                        />
                        <span>
                          <span className="font-medium">{c.title}</span>
                          <span className="ml-2 text-xs text-synapse-muted">
                            {c.category === "mandatory" ? "Obbligatorio" : "Facoltativo"} · {c.durationMinutes} min
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-synapse-muted">
                  Se non selezioni corsi, al completamento del passo verranno assegnati automaticamente tutti i corsi
                  obbligatori.
                </p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t border-[var(--card-border)] pt-4">
            <Button type="button" variant="secondary" disabled={saving} onClick={() => void persist(false)}>
              Salva bozza
            </Button>
            <Button type="button" disabled={saving} onClick={() => void persist(true)}>
              {saving ? "Salvataggio…" : stepIndex < steps.length - 1 ? "Salva e avanti" : "Completa onboarding"}
            </Button>
            {stepIndex > 0 ? (
              <Button type="button" variant="ghost" onClick={() => setStepIndex(stepIndex - 1)}>
                Indietro
              </Button>
            ) : null}
          </div>

          {wizard.completedAt ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              Onboarding completato il {new Date(wizard.completedAt).toLocaleString("it-IT")}. Stato impiego impostato
              su attivo.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
