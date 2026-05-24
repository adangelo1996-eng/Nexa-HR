"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { HebbFieldAssistProvider, HebbInput, HebbTextarea } from "@/components/hebb-field-assist";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  cancelHrOffboarding,
  fetchHrOffboardingWizard,
  saveHrOffboardingWizardStep,
  sendHrOffboardingReminder,
  uploadDocumentToVault,
  type HrOffboardingWizardDto
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

export function HrOffboardingWizardPanel({ token, userId, employeeName }: Props): React.JSX.Element {
  const router = useRouter();
  const [wizard, setWizard] = useState<HrOffboardingWizardDto | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});

  const steps = wizard?.stepDefinitions ?? [];
  const current = steps[stepIndex];
  const currentKey = current?.key ?? "";
  const progressPct = steps.length > 0 ? Math.round(((stepIndex + 1) / steps.length) * 100) : 0;

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const w = await fetchHrOffboardingWizard(token, userId);
      setWizard(w);
      setStepIndex(w.currentStepIndex);
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

  async function persist(markDone: boolean): Promise<void> {
    if (!currentKey) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await saveHrOffboardingWizardStep(token, userId, {
        stepKey: currentKey,
        data: form,
        markDone
      });
      setWizard(updated);
      if (markDone && stepIndex < steps.length - 1) {
        setStepIndex(stepIndex + 1);
      }
      if (updated.completedAt) {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Salvataggio non riuscito");
    } finally {
      setSaving(false);
    }
  }

  async function onCancel(): Promise<void> {
    if (!window.confirm("Annullare l'offboarding e ripristinare lo stato attivo del dipendente?")) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await cancelHrOffboarding(token, userId);
      router.push("/hr-recap");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Annullamento non riuscito");
    } finally {
      setSaving(false);
    }
  }

  async function onUploadContractPdf(file: File): Promise<void> {
    const b64 = await fileToBase64(file);
    const doc = await uploadDocumentToVault(token, {
      title: "Contratto firmato",
      kind: "contract",
      mimeType: file.type || "application/pdf",
      bodyBase64: b64,
      targetUserId: userId
    });
    setForm({
      ...form,
      signedContractDocumentId: doc.id,
      signedContractTitle: doc.title,
      contractPdfRequired: false
    });
  }

  if (loading || !wizard || !current) {
    return <p className="text-sm text-synapse-muted">Caricamento wizard offboarding…</p>;
  }

  if (wizard.cancelledAt) {
    return (
      <p className="text-sm text-synapse-muted">
        Procedura annullata.{" "}
        <Link href="/hr-recap" className="text-[#002D72] underline dark:text-sky-200">
          Torna al recap HR
        </Link>
      </p>
    );
  }

  const formId = `hr.offboarding.wizard.${currentKey}`;
  const prefilled = wizard.prefilled;
  const noticeSourceLabel =
    prefilled?.noticePeriodSource === "user"
      ? "da anagrafica dipendente"
      : prefilled?.noticePeriodSource === "contract"
        ? "da contratto HR"
        : null;

  return (
    <HebbFieldAssistProvider formId={formId} partialForm={form} context={{ stepKey: currentKey, userId }}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-synapse-muted">Offboarding HR</p>
            <h2 className="text-lg font-semibold text-synapse-text dark:text-white">{employeeName}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={saving || Boolean(wizard.completedAt)} onClick={() => void onCancel()}>
              Annulla procedura
            </Button>
            {!wizard.completedAt && !wizard.cancelledAt ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={saving}
                onClick={() => {
                  setSaving(true);
                  void sendHrOffboardingReminder(token, userId)
                    .catch((e) => setError(e instanceof Error ? e.message : "Promemoria non inviato"))
                    .finally(() => setSaving(false));
                }}
              >
                Invia promemoria
              </Button>
            ) : null}
            <Link href="/hr-recap" className="text-xs text-[#002D72] underline-offset-2 hover:underline dark:text-sky-200">
              Recap HR →
            </Link>
          </div>
        </div>

        {wizard.completedAt ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100">
            Offboarding completato il{" "}
            {new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(
              new Date(wizard.completedAt)
            )}
            . Accessi revocati dove previsto dalla checklist.
          </div>
        ) : null}

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
        </div>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        <Card className="border-[var(--card-border)]">
          <CardHeader>
            <CardTitle className="text-base">{current.titleIt}</CardTitle>
            <CardDescription>{current.descriptionIt}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentKey === "avvio_preavviso" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <HebbInput
                  label="Motivo uscita"
                  fieldKey="exitReason"
                  formId={formId}
                  partialForm={form}
                  value={String(form.exitReason ?? "")}
                  onChange={(v) => setForm({ ...form, exitReason: v })}
                />
                <HebbInput
                  label="Data comunicazione"
                  fieldKey="communicationDate"
                  type="date"
                  formId={formId}
                  partialForm={form}
                  value={String(form.communicationDate ?? "")}
                  onChange={(v) => setForm({ ...form, communicationDate: v })}
                />
                <HebbInput
                  label="Ultimo giorno lavorativo"
                  fieldKey="lastWorkingDay"
                  type="date"
                  formId={formId}
                  partialForm={form}
                  value={String(form.lastWorkingDay ?? "")}
                  onChange={(v) => setForm({ ...form, lastWorkingDay: v })}
                />
                <div>
                  <HebbInput
                    label={`Preavviso (mesi)${noticeSourceLabel ? ` — ${noticeSourceLabel}` : ""}`}
                    fieldKey="noticePeriodMonths"
                    type="number"
                    formId={formId}
                    partialForm={form}
                    value={String(form.noticePeriodMonths ?? "")}
                    onChange={(v) => setForm({ ...form, noticePeriodMonths: v, noticePeriodSource: "manual" })}
                  />
                  {!form.noticePeriodMonths && prefilled?.noticePeriodMonths == null ? (
                    <p className="mt-1 text-xs text-synapse-muted">
                      Non trovato in anagrafica/contratto: inserire manualmente (es. 1–6 mesi per CCNL commercio).
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {currentKey === "documenti_uscita" ? (
              <div className="space-y-3">
                {form.signedContractDocumentId || prefilled?.signedContractDocumentId ? (
                  <p className="text-sm text-emerald-700 dark:text-emerald-300">
                    ✓ Contratto firmato collegato:{" "}
                    {String(form.signedContractTitle ?? prefilled?.signedContractTitle ?? "documento")}
                  </p>
                ) : (
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    Contratto firmato non presente nel vault: caricare il PDF sul profilo dipendente.
                  </p>
                )}
                <label className="block text-sm">
                  <span className="text-synapse-muted">Carica contratto firmato (PDF)</span>
                  <input
                    type="file"
                    className="mt-1 w-full text-sm"
                    accept=".pdf,application/pdf"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        void onUploadContractPdf(f).catch((err) =>
                          setError(err instanceof Error ? err.message : "Upload fallito")
                        );
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
                <HebbTextarea
                  label="Asset da restituire"
                  fieldKey="assetsNotes"
                  formId={formId}
                  partialForm={form}
                  placeholder="PC, telefono, badge, chiavi…"
                  value={String(form.assetsNotes ?? "")}
                  onChange={(v) => setForm({ ...form, assetsNotes: v })}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(form.assetsReturned)}
                    onChange={(e) => setForm({ ...form, assetsReturned: e.target.checked })}
                  />
                  Asset e documenti di restituzione consegnati
                </label>
              </div>
            ) : null}

            {currentKey === "revoca_accessi_it" ? (
              <div className="grid gap-2 text-sm">
                {["accountEmail", "adGroups", "vpn", "mfa", "licensesRevoked"].map((key) => (
                  <HebbInput
                    key={key}
                    label={<span className="capitalize">{key.replace(/([A-Z])/g, " $1")}</span>}
                    fieldKey={key}
                    formId={formId}
                    partialForm={form}
                    value={String(form[key] ?? "")}
                    onChange={(v) => setForm({ ...form, [key]: v })}
                  />
                ))}
                <label className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    checked={Boolean(form.accessRevoked)}
                    onChange={(e) => setForm({ ...form, accessRevoked: e.target.checked })}
                  />
                  Accessi IT revocati
                </label>
              </div>
            ) : null}

            {currentKey === "badge_fisico" ? (
              <div className="grid gap-2">
                <HebbInput
                  label="Numero badge"
                  fieldKey="badgeNumber"
                  formId={formId}
                  partialForm={form}
                  value={String(form.badgeNumber ?? "")}
                  onChange={(v) => setForm({ ...form, badgeNumber: v })}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(form.badgeReturned)}
                    onChange={(e) => setForm({ ...form, badgeReturned: e.target.checked })}
                  />
                  Badge e accessi fisici revocati
                </label>
              </div>
            ) : null}

            {currentKey === "exit_interview" ? (
              <HebbTextarea
                label="Note exit interview (riservate HR)"
                fieldKey="exitInterviewNotes"
                formId={formId}
                partialForm={form}
                value={String(form.exitInterviewNotes ?? "")}
                onChange={(v) => setForm({ ...form, exitInterviewNotes: v })}
              />
            ) : null}

            {currentKey === "cedolino_finale" ? (
              <div className="space-y-3">
                <HebbInput
                  label="Referente payroll"
                  fieldKey="payrollContact"
                  formId={formId}
                  partialForm={form}
                  value={String(form.payrollContact ?? "")}
                  onChange={(v) => setForm({ ...form, payrollContact: v })}
                />
                <HebbTextarea
                  label="Note cedolino finale / TFR / ratei"
                  fieldKey="payrollNotes"
                  formId={formId}
                  partialForm={form}
                  value={String(form.payrollNotes ?? "")}
                  onChange={(v) => setForm({ ...form, payrollNotes: v })}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(form.payrollHandoffDone)}
                    onChange={(e) => setForm({ ...form, payrollHandoffDone: e.target.checked })}
                  />
                  Handoff payroll completato
                </label>
              </div>
            ) : null}

            {currentKey === "formazione_chiusura" ? (
              <div className="space-y-3">
                <HebbTextarea
                  label="Corsi / certificazioni da chiudere"
                  fieldKey="trainingNotes"
                  formId={formId}
                  partialForm={form}
                  value={String(form.trainingNotes ?? "")}
                  onChange={(v) => setForm({ ...form, trainingNotes: v })}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(form.trainingClosed)}
                    onChange={(e) => setForm({ ...form, trainingClosed: e.target.checked })}
                  />
                  Formazione e certificazioni chiuse
                </label>
              </div>
            ) : null}

            {currentKey === "completamento" ? (
              <div className="space-y-3 text-sm">
                <p className="text-synapse-muted">
                  Conferma che tutti i passi precedenti sono stati completati. Al salvataggio verranno revocati gli
                  accessi secondo la checklist lifecycle.
                </p>
                <ul className="space-y-1 rounded-lg border border-[var(--prom-line)] p-3 text-xs">
                  {steps.slice(0, -1).map((s) => (
                    <li key={s.key} className={wizard.steps[s.key]?.done ? "text-emerald-700 dark:text-emerald-300" : "text-amber-800 dark:text-amber-200"}>
                      {wizard.steps[s.key]?.done ? "✓" : "○"} {s.titleIt}
                    </li>
                  ))}
                </ul>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(form.confirmed)}
                    onChange={(e) => setForm({ ...form, confirmed: e.target.checked })}
                  />
                  <span>Confermo la chiusura della procedura di offboarding</span>
                </label>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="button" variant="outline" disabled={saving || stepIndex === 0} onClick={() => setStepIndex(stepIndex - 1)}>
                Indietro
              </Button>
              <Button type="button" variant="secondary" disabled={saving || Boolean(wizard.completedAt)} onClick={() => void persist(false)}>
                Salva bozza
              </Button>
              <Button
                type="button"
                disabled={saving || Boolean(wizard.completedAt) || (currentKey === "completamento" && !form.confirmed)}
                onClick={() => void persist(true)}
              >
                {saving ? "Salvataggio…" : currentKey === "completamento" ? "Completa offboarding" : "Salva e continua"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </HebbFieldAssistProvider>
  );
}
