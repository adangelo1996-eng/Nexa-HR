"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileSignature, Loader2 } from "lucide-react";
import { NexaHrAppPage } from "@/components/nexa-hr-app-page";
import { Button } from "@/components/ui/button";
import {
  downloadDocumentVaultFile,
  fetchVaultSignatureRequests,
  signVaultDocument,
  type HrDocumentSignatureRequestDto
} from "@/lib/api";
import { getSessionUser, getToken } from "@/lib/auth-session";

const KIND_LABELS: Record<string, string> = {
  contract: "Contratto",
  payslip: "Cedolino",
  personal: "Personale",
  other: "Altro"
};

function PercorsoDocumentiPageContent(): React.JSX.Element {
  const searchParams = useSearchParams();
  const preselectDocId = searchParams.get("sign")?.trim() ?? "";
  const me = getSessionUser();

  const [pending, setPending] = useState<HrDocumentSignatureRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [signerName, setSignerName] = useState(me?.fullName ?? "");
  const [signBusy, setSignBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchVaultSignatureRequests(token, {
        role: "employee",
        status: "pending_employee_sign"
      });
      setPending(res.items);
      if (preselectDocId && res.items.some((r) => r.documentId === preselectDocId)) {
        setSelectedId(preselectDocId);
      } else if (res.items[0]) {
        setSelectedId((prev) => prev ?? res.items[0]!.documentId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento richieste firma");
      setPending([]);
    } finally {
      setLoading(false);
    }
  }, [preselectDocId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => pending.find((r) => r.documentId === selectedId) ?? null,
    [pending, selectedId]
  );

  const openPreview = useCallback(async () => {
    const token = getToken();
    if (!token || !selected) return;
    setPreviewBusy(true);
    setError(null);
    try {
      const blob = await downloadDocumentVaultFile(token, selected.documentId);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Anteprima non disponibile");
    } finally {
      setPreviewBusy(false);
    }
  }, [selected]);

  const onSign = useCallback(async () => {
    const token = getToken();
    if (!token || !selected) return;
    const name = signerName.trim();
    if (!name) {
      setError("Inserisci il nome per la firma digitale.");
      return;
    }
    setSignBusy(true);
    setError(null);
    setMsg(null);
    try {
      await signVaultDocument(token, selected.documentId, { employeeSignerName: name });
      setMsg("Documento firmato. HR riceverà una notifica di restituzione.");
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Firma non riuscita");
    } finally {
      setSignBusy(false);
    }
  }, [selected, signerName, load]);

  return (
    <NexaHrAppPage
      eyebrow="Percorso"
      title="Documenti da firmare"
      subtitle="Revisioni HR pubblicate in vault che richiedono la tua firma digitale."
    >
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-[var(--prom-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Caricamento…
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100">
          {msg}
        </p>
      ) : null}
      {!loading && pending.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--prom-line)] px-4 py-8 text-center text-sm text-[var(--prom-muted)]">
          Nessuna firma in sospeso.
        </p>
      ) : null}
      {pending.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <ul className="space-y-2">
            {pending.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(r.documentId)}
                  className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${
                    selectedId === r.documentId
                      ? "border-[color-mix(in_srgb,var(--prom-accent)_45%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-accent)_8%,transparent)]"
                      : "border-[var(--prom-line)] hover:bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)]"
                  }`}
                >
                  <span className="font-medium text-[var(--prom-text)]">
                    {r.documentTitle ?? `Documento ${r.documentId}`}
                  </span>
                  <span className="mt-1 block text-xs text-[var(--prom-muted)]">
                    {r.documentKind ? (KIND_LABELS[r.documentKind] ?? r.documentKind) : "—"} ·{" "}
                    {new Date(r.createdAt).toLocaleDateString("it-IT")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {selected ? (
            <div className="rounded-xl border border-[var(--prom-line)] p-4">
              <div className="flex items-start gap-2">
                <FileSignature className="mt-0.5 h-5 w-5 text-[var(--prom-accent)]" aria-hidden />
                <div>
                  <h2 className="text-base font-semibold text-[var(--prom-text)]">
                    {selected.documentTitle ?? "Documento"}
                  </h2>
                  <p className="mt-1 text-xs text-[var(--prom-muted)]">
                    Apri il file, verifica il contenuto e conferma con firma digitale (come per i contratti standard).
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={previewBusy} onClick={() => void openPreview()}>
                  {previewBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apri documento"}
                </Button>
              </div>
              <label className="mt-4 block text-sm">
                <span className="mb-1 block text-[var(--prom-muted)]">Nome e cognome (firma)</span>
                <input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  className="w-full rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2 text-sm"
                  autoComplete="name"
                />
              </label>
              <Button
                type="button"
                className="mt-4 gap-1.5"
                size="sm"
                disabled={signBusy}
                onClick={() => void onSign()}
              >
                {signBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSignature className="h-3.5 w-3.5" />}
                Applica firma digitale
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </NexaHrAppPage>
  );
}

export default function PercorsoDocumentiPage(): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <NexaHrAppPage eyebrow="Percorso" title="Documenti da firmare" subtitle="Caricamento…">
          <p className="text-sm text-[var(--prom-muted)]">Caricamento richieste firma…</p>
        </NexaHrAppPage>
      }
    >
      <PercorsoDocumentiPageContent />
    </Suspense>
  );
}
