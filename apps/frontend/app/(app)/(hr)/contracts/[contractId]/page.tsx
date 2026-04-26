"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  exportHrStandardContractPdf,
  fetchHrStandardContract,
  fetchHrStandardContractVersions,
  openHrContractLinkedFileDownload,
  patchHrStandardContract,
  restoreHrStandardContractVersion,
  signHrStandardContract,
  uploadHrContractSignedScan
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import {
  applyPartyPlaceholdersToContractBlocks,
  CONTRACT_BLOCK_LIBRARY,
  hrContractFromApi,
  type HrContractDoc
} from "@/lib/contracts";

function b64FromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Impossibile leggere PDF"));
    r.onload = () => {
      const res = String(r.result ?? "");
      const comma = res.indexOf(",");
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    r.readAsDataURL(blob);
  });
}

export default function ContractEditorPage(): React.JSX.Element {
  const router = useRouter();
  const params = useParams<{ contractId: string }>();
  const contractId = params.contractId;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [localDoc, setLocalDoc] = useState<HrContractDoc | null>(null);
  const [versions, setVersions] = useState<Array<{ version: number; created_at: string; note: string }>>([]);
  const [signCompany, setSignCompany] = useState("");
  const [signEmployee, setSignEmployee] = useState("");
  const [addingBlockKey, setAddingBlockKey] = useState<string>("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editingUnlocked, setEditingUnlocked] = useState(false);
  const [signedScanUploading, setSignedScanUploading] = useState(false);
  const [linkedDownloadBusy, setLinkedDownloadBusy] = useState<"export" | "scan" | null>(null);

  function syncBlocksFromPartyFields(): void {
    setLocalDoc((d) => {
      if (!d) return d;
      return { ...d, blocks: applyPartyPlaceholdersToContractBlocks(d.blocks, d.party) };
    });
    setError(null);
    setMsg("Blocchi aggiornati dai campi in alto. Usa «Salva» per persistere sul server.");
  }

  function validateDoc(d: HrContractDoc): string[] {
    const errs: string[] = [];
    const p = d.party;
    if (!p.companyLegalName?.trim()) errs.push("Ragione sociale obbligatoria");
    if (!p.employeeFirstName?.trim()) errs.push("Nome lavoratore obbligatorio");
    if (!p.employeeLastName?.trim()) errs.push("Cognome lavoratore obbligatorio");
    if (!p.startDateIso?.trim()) errs.push("Data inizio obbligatoria");
    if (!p.workLocation?.trim()) errs.push("Sede di lavoro obbligatoria");
    if (!p.roleTitle?.trim()) errs.push("Mansione obbligatoria");
    if (!p.payMonthsPerYear) errs.push("Mensilità obbligatorie");
    if (!Number.isFinite(Number(p.ralEuros ?? NaN))) errs.push("RAL obbligatoria");
    if (!Array.isArray(d.blocks) || d.blocks.length === 0) errs.push("Almeno un blocco contratto è obbligatorio");
    for (const b of d.blocks) {
      if (!b.title.trim()) errs.push("Titolo blocco mancante");
      if (!b.content.trim()) errs.push(`Contenuto vuoto in: ${b.title}`);
      /** Solo `{{…}}` merge-field: i testi tra [ ] sono valori di default leciti dopo fill. */
      if (/\{\{[^}]+\}\}/.test(b.content)) {
        errs.push(`Placeholder non risolti in: ${b.title}`);
      }
    }
    return errs;
  }

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    let cancel = false;
    setLoading(true);
    setLoadError(false);
    void fetchHrStandardContract(token, contractId)
      .then((d) => {
        if (!cancel) {
          setLocalDoc(hrContractFromApi(d));
          void fetchHrStandardContractVersions(token, contractId).then((items) => setVersions(items)).catch(() => undefined);
        }
      })
      .catch(() => {
        if (!cancel) setLoadError(true);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [contractId, router]);

  if (loading) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">Caricamento contratto…</p>
      </div>
    );
  }

  if (loadError || !localDoc) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-synapse-text dark:text-white">Contratto non trovato</h1>
        <Button type="button" variant="secondary" onClick={() => router.push("/contracts")}>
          Torna a contratti
        </Button>
      </div>
    );
  }

  const isExported = localDoc.status === "exported";
  const needsWorkflowLock = localDoc.status === "approved" || Boolean(localDoc.signedAt);
  const canEditFields =
    !isExported && (localDoc.status === "draft" || !needsWorkflowLock || editingUnlocked);

  async function onSave(): Promise<void> {
    if (!localDoc) return;
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const updated = await patchHrStandardContract(token, localDoc.id, {
        title: localDoc.title,
        party: { ...localDoc.party },
        blocks: localDoc.blocks as unknown[]
      });
      setLocalDoc(hrContractFromApi(updated));
      setEditingUnlocked(false);
      setMsg("Salvato.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  }

  async function onApprove(): Promise<void> {
    if (!localDoc) return;
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setError(null);
    setMsg(null);
    try {
      const mergedBlocks = applyPartyPlaceholdersToContractBlocks(localDoc.blocks, localDoc.party);
      const docForValidate: HrContractDoc = { ...localDoc, blocks: mergedBlocks };
      const errs = validateDoc(docForValidate);
      if (errs.length) {
        setError(errs.join(" • "));
        return;
      }
      const updated = await patchHrStandardContract(token, localDoc.id, {
        title: localDoc.title,
        party: { ...localDoc.party },
        blocks: mergedBlocks as unknown[],
        status: "approved"
      });
      setLocalDoc(hrContractFromApi(updated));
      setEditingUnlocked(false);
      setMsg("Contratto approvato.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore approvazione");
    }
  }

  async function onSign(): Promise<void> {
    if (!localDoc) return;
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setError(null);
    setMsg(null);
    try {
      const mergedBlocks = applyPartyPlaceholdersToContractBlocks(localDoc.blocks, localDoc.party);
      const docForValidate: HrContractDoc = { ...localDoc, blocks: mergedBlocks };
      const errs = validateDoc(docForValidate);
      if (errs.length) {
        setError(errs.join(" • "));
        return;
      }
      await patchHrStandardContract(token, localDoc.id, {
        title: localDoc.title,
        party: { ...localDoc.party },
        blocks: mergedBlocks as unknown[]
      });
      const updated = await signHrStandardContract(token, localDoc.id, {
        companySignerName: signCompany.trim(),
        employeeSignerName: signEmployee.trim()
      });
      setLocalDoc(hrContractFromApi(updated));
      setEditingUnlocked(false);
      setMsg("Contratto firmato.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore firma");
    }
  }

  async function onExportPdfServer(): Promise<void> {
    if (!localDoc) return;
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setExporting(true);
    setError(null);
    setMsg(null);
    try {
      const updated = await exportHrStandardContractPdf(token, localDoc.id);
      setLocalDoc(hrContractFromApi(updated));
      setMsg("PDF esportato lato server e salvato nel vault documenti.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore export PDF");
    } finally {
      setExporting(false);
    }
  }

  async function onSignedScanFileSelect(file: File | null): Promise<void> {
    if (!file || !localDoc) return;
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setSignedScanUploading(true);
    setError(null);
    setMsg(null);
    try {
      const blob = new Blob([file], { type: file.type || "application/pdf" });
      const b64 = await b64FromBlob(blob);
      const updated = await uploadHrContractSignedScan(token, localDoc.id, {
        bodyBase64: b64,
        mimeType: file.type || "application/pdf",
        title: `${localDoc.title} (scansione firmata)`
      });
      setLocalDoc(hrContractFromApi(updated));
      setMsg("Scansione firmata caricata. Puoi completare l’anagrafica del nuovo dipendente da Admin.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento scansione");
    } finally {
      setSignedScanUploading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-synapse-text dark:text-white">{localDoc.title}</h1>
        <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">
          Stato: <strong className="text-synapse-text dark:text-white">{localDoc.status.toUpperCase()}</strong>
          {localDoc.signedAt ? (
            <>
              {" "}
              · firmato: <strong className="text-synapse-text dark:text-white">{localDoc.signedAt.slice(0, 10)}</strong>
            </>
          ) : null}
        </p>
        {needsWorkflowLock && !isExported ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-synapse-text dark:text-amber-100/95">
            <span>Contenuto in sola lettura (approvato o già firmato in sistema). Usa «Modifica» per cambiare testi o refirmare.</span>
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditingUnlocked((v) => !v)}>
              {editingUnlocked ? "Termina modifica" : "Modifica"}
            </Button>
          </div>
        ) : null}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Dati precompilazione</CardTitle>
          <CardDescription>Modifica questi campi e poi salva; puoi aggiornare anche i blocchi sotto.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#b4c9dc]">Ragione sociale</span>
              <Input
                disabled={!canEditFields}
                value={localDoc.party.companyLegalName}
                onChange={(e) =>
                  setLocalDoc((d) => (d ? { ...d, party: { ...d.party, companyLegalName: e.target.value } } : d))
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#b4c9dc]">Indirizzo azienda</span>
              <Input
                disabled={!canEditFields}
                value={localDoc.party.companyAddress ?? ""}
                onChange={(e) =>
                  setLocalDoc((d) => (d ? { ...d, party: { ...d.party, companyAddress: e.target.value } } : d))
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#b4c9dc]">Nome</span>
              <Input
                disabled={!canEditFields}
                value={localDoc.party.employeeFirstName}
                onChange={(e) =>
                  setLocalDoc((d) => (d ? { ...d, party: { ...d.party, employeeFirstName: e.target.value } } : d))
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#b4c9dc]">Cognome</span>
              <Input
                disabled={!canEditFields}
                value={localDoc.party.employeeLastName}
                onChange={(e) =>
                  setLocalDoc((d) => (d ? { ...d, party: { ...d.party, employeeLastName: e.target.value } } : d))
                }
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-synapse-muted dark:text-[#b4c9dc]">Indirizzo lavoratore</span>
              <Input
                disabled={!canEditFields}
                value={localDoc.party.employeeAddress ?? ""}
                onChange={(e) =>
                  setLocalDoc((d) => (d ? { ...d, party: { ...d.party, employeeAddress: e.target.value } } : d))
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#b4c9dc]">Mansione</span>
              <Input
                disabled={!canEditFields}
                value={localDoc.party.roleTitle ?? ""}
                onChange={(e) =>
                  setLocalDoc((d) => (d ? { ...d, party: { ...d.party, roleTitle: e.target.value } } : d))
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#b4c9dc]">Sede di lavoro</span>
              <Input
                disabled={!canEditFields}
                value={localDoc.party.workLocation ?? ""}
                onChange={(e) =>
                  setLocalDoc((d) => (d ? { ...d, party: { ...d.party, workLocation: e.target.value } } : d))
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#b4c9dc]">Data inizio</span>
              <Input
                disabled={!canEditFields}
                type="date"
                value={(localDoc.party.startDateIso ?? "").slice(0, 10)}
                onChange={(e) =>
                  setLocalDoc((d) => (d ? { ...d, party: { ...d.party, startDateIso: e.target.value } } : d))
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#b4c9dc]">Mensilità</span>
              <select
                disabled={!canEditFields}
                value={localDoc.party.payMonthsPerYear ?? 13}
                onChange={(e) =>
                  setLocalDoc((d) =>
                    d ? { ...d, party: { ...d.party, payMonthsPerYear: Number(e.target.value) as 12 | 13 | 14 } } : d
                  )
                }
                className="w-full rounded-lg border border-slate-300/90 bg-white/90 px-3 py-2 text-sm text-synapse-text shadow-sm outline-none transition dark:border-white/15 dark:bg-[#052642]/90 dark:text-white"
              >
                <option value={12}>12</option>
                <option value={13}>13</option>
                <option value={14}>14</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#b4c9dc]">RAL</span>
              <Input
                disabled={!canEditFields}
                type="number"
                inputMode="numeric"
                min={0}
                step={100}
                value={localDoc.party.ralEuros ?? 0}
                onChange={(e) =>
                  setLocalDoc((d) => (d ? { ...d, party: { ...d.party, ralEuros: Number(e.target.value) } } : d))
                }
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void onSave()} disabled={saving}>
              {saving ? "Salvataggio…" : "Salva"}
            </Button>
            <Button type="button" variant="outline" disabled={!canEditFields} onClick={() => syncBlocksFromPartyFields()}>
              Aggiorna testo dai campi
            </Button>
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)}>
              Anteprima contratto
            </Button>
            <Button type="button" variant="secondary" onClick={() => router.push("/contracts")}>
              Torna a elenco
            </Button>
            <div className="flex-1" />
            <Button type="button" variant="secondary" onClick={() => void onApprove()} disabled={!canEditFields}>
              Approva
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void onSign()}
              disabled={!canEditFields || localDoc.status !== "approved"}
            >
              Firma
            </Button>
            <Button
              type="button"
              onClick={() => void onExportPdfServer()}
              disabled={exporting || localDoc.status !== "approved" || !localDoc.signedAt}
            >
              {exporting ? "Export…" : "Esporta PDF (server)"}
            </Button>
          </div>

          {localDoc.status === "approved" ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-synapse-muted dark:text-[#b4c9dc]">Firmatario azienda</span>
                <Input disabled={!canEditFields} value={signCompany} onChange={(e) => setSignCompany(e.target.value)} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-synapse-muted dark:text-[#b4c9dc]">Firmatario lavoratore</span>
                <Input disabled={!canEditFields} value={signEmployee} onChange={(e) => setSignEmployee(e.target.value)} />
              </label>
            </div>
          ) : null}

          {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
          {msg ? <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">{msg}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documenti (PDF e scansione)</CardTitle>
          <CardDescription>Scarica il PDF generato dall’export, carica la scansione cartacea firmata, oppure vai in Admin per creare l’utente dipendente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-synapse-text dark:text-white">
          <div className="flex flex-wrap gap-2">
            {localDoc.lastExportedDocumentId ? (
              <Button
                type="button"
                variant="secondary"
                disabled={linkedDownloadBusy === "export"}
                onClick={() => {
                  const token = getToken();
                  if (!token) {
                    router.replace("/login");
                    return;
                  }
                  if (!localDoc?.lastExportedDocumentId) return;
                  setError(null);
                  setLinkedDownloadBusy("export");
                  void openHrContractLinkedFileDownload(
                    token,
                    localDoc.id,
                    localDoc.lastExportedDocumentId,
                    "contratto-esportato.pdf"
                  )
                    .catch((e) => setError(e instanceof Error ? e.message : "Download non riuscito"))
                    .finally(() => setLinkedDownloadBusy(null));
                }}
              >
                {linkedDownloadBusy === "export" ? "Apertura…" : "Scarica PDF esportato"}
              </Button>
            ) : (
              <p className="text-synapse-muted dark:text-[#b4c9dc]">PDF esportato non ancora disponibile (dopo «Esporta PDF»).</p>
            )}
            {localDoc.signedScanDocumentId ? (
              <Button
                type="button"
                variant="secondary"
                disabled={linkedDownloadBusy === "scan"}
                onClick={() => {
                  const token = getToken();
                  if (!token) {
                    router.replace("/login");
                    return;
                  }
                  if (!localDoc?.signedScanDocumentId) return;
                  setError(null);
                  setLinkedDownloadBusy("scan");
                  void openHrContractLinkedFileDownload(
                    token,
                    localDoc.id,
                    localDoc.signedScanDocumentId,
                    "contratto-firmato-scansione.pdf"
                  )
                    .catch((e) => setError(e instanceof Error ? e.message : "Download non riuscito"))
                    .finally(() => setLinkedDownloadBusy(null));
                }}
              >
                {linkedDownloadBusy === "scan" ? "Apertura…" : "Scarica scansione firmata"}
              </Button>
            ) : null}
          </div>
          {localDoc.status === "draft" ? (
            <p className="text-synapse-muted dark:text-[#b4c9dc]">Il caricamento della scansione firmata è disponibile dopo l’approvazione del testo (almeno stato «Approvato»).</p>
          ) : (
            <div className="space-y-2">
              <label className="block text-synapse-muted dark:text-[#b4c9dc]">Carica PDF / scansione firmata (MVP inline, max come da policy upload)</label>
              <input
                type="file"
                accept="application/pdf,image/*"
                disabled={isExported || signedScanUploading}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  void onSignedScanFileSelect(f);
                }}
                className="block w-full text-sm"
              />
              {signedScanUploading ? <p className="text-synapse-muted">Caricamento in corso…</p> : null}
            </div>
          )}
          <p>
            <Link
              className="font-medium text-[#002D72] underline underline-offset-2 hover:opacity-90 dark:text-sky-300"
              href="/admin"
            >
              Apri anagrafica / Admin
            </Link>{" "}
            per creare o completare l’utente dipendente dopo export o scansione.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Versioni</CardTitle>
          <CardDescription>Storico salvataggi (puoi ripristinare una versione).</CardDescription>
        </CardHeader>
        <CardContent>
          {versions.length === 0 ? (
            <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">Nessuna versione registrata.</p>
          ) : (
            <ul className="space-y-2">
              {versions.map((v) => (
                <li key={v.version} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--card-border)] p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-synapse-text dark:text-white">v{v.version}</p>
                    <p className="text-xs text-synapse-muted dark:text-[#b4c9dc]">{String(v.created_at).slice(0, 19).replace("T", " ")}</p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      const token = getToken();
                      if (!token) {
                        router.replace("/login");
                        return;
                      }
                      if (!window.confirm(`Ripristinare la versione v${v.version}?`)) return;
                      setError(null);
                      setMsg(null);
                      void restoreHrStandardContractVersion(token, localDoc.id, v.version)
                        .then((updated) => {
                          setLocalDoc(hrContractFromApi(updated));
                          setMsg(`Ripristinata v${v.version}.`);
                          return fetchHrStandardContractVersions(token, localDoc.id).then((items) => setVersions(items));
                        })
                        .catch((e) => setError(e instanceof Error ? e.message : "Errore ripristino"));
                    }}
                  >
                    Ripristina
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Blocchi contratto</CardTitle>
          <CardDescription>Macro sezioni modificabili.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto]">
            <select
              value={addingBlockKey}
              onChange={(e) => setAddingBlockKey(e.target.value)}
              className="w-full rounded-lg border border-slate-300/90 bg-white/90 px-3 py-2 text-sm text-synapse-text shadow-sm outline-none transition dark:border-white/15 dark:bg-[#052642]/90 dark:text-white"
            >
              <option value="">Aggiungi blocco…</option>
              {CONTRACT_BLOCK_LIBRARY.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.title}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="secondary"
              disabled={!canEditFields || !addingBlockKey}
              onClick={() => {
                const lib = CONTRACT_BLOCK_LIBRARY.find((b) => b.key === addingBlockKey);
                if (!lib) return;
                setLocalDoc((d) => (d ? { ...d, blocks: [...d.blocks, { ...lib }] } : d));
                setAddingBlockKey("");
              }}
            >
              Aggiungi
            </Button>
          </div>
          <div className="space-y-4">
            {localDoc.blocks.map((b, idx) => (
              <div key={`${idx}-${b.key}`} className="rounded-lg border border-[var(--card-border)] bg-[var(--prom-surface)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-synapse-text dark:text-white">{b.title}</p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!canEditFields || idx === 0}
                      onClick={() =>
                        setLocalDoc((d) => {
                          if (!d) return d;
                          const next = d.blocks.slice();
                          const tmp = next[idx - 1]!;
                          next[idx - 1] = next[idx]!;
                          next[idx] = tmp;
                          return { ...d, blocks: next };
                        })
                      }
                    >
                      Su
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!canEditFields || idx === localDoc.blocks.length - 1}
                      onClick={() =>
                        setLocalDoc((d) => {
                          if (!d) return d;
                          const next = d.blocks.slice();
                          const tmp = next[idx + 1]!;
                          next[idx + 1] = next[idx]!;
                          next[idx] = tmp;
                          return { ...d, blocks: next };
                        })
                      }
                    >
                      Giù
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!canEditFields || Boolean(b.locked)}
                      onClick={() => {
                        if (!window.confirm("Rimuovere il blocco?")) return;
                        setLocalDoc((d) => (d ? { ...d, blocks: d.blocks.filter((_, i) => i !== idx) } : d));
                      }}
                    >
                      Rimuovi
                    </Button>
                  </div>
                </div>
                <textarea
                  className="mt-2 min-h-[120px] w-full resize-y rounded-lg border border-slate-300/90 bg-white/90 p-3 text-sm text-synapse-text shadow-sm outline-none transition dark:border-white/15 dark:bg-[#052642]/90 dark:text-white"
                  disabled={!canEditFields || Boolean(b.locked)}
                  value={b.content}
                  onChange={(e) =>
                    setLocalDoc((d) => {
                      if (!d) return d;
                      const nextBlocks = d.blocks.slice();
                      nextBlocks[idx] = { ...nextBlocks[idx]!, content: e.target.value };
                      return { ...d, blocks: nextBlocks };
                    })
                  }
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {previewOpen && localDoc ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Anteprima contratto">
          <button
            type="button"
            className="absolute inset-0 bg-black/65 backdrop-blur-[2px] transition-opacity"
            aria-label="Chiudi anteprima"
            onClick={() => setPreviewOpen(false)}
          />
          <div className="relative flex max-h-[min(92vh,880px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#002D72]/35 bg-[#061a33] text-white shadow-[0_24px_80px_-20px_rgba(0,45,114,0.55)]">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-200/90">Anteprima</p>
                <p className="text-lg font-semibold text-white">{localDoc.title}</p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => setPreviewOpen(false)}>
                Chiudi
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-8 rounded-xl bg-white/[0.04] p-5 ring-1 ring-white/10">
                {localDoc.blocks.map((b) => (
                  <article key={`${b.key}-${b.title}`} className="border-b border-white/10 pb-8 last:border-0 last:pb-0">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-sky-100/90">{b.title}</h3>
                    <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-white/90">{b.content}</div>
                  </article>
                ))}
              </div>
              <p className="mt-4 text-center text-[11px] text-white/50">
                Anteprima di lavoro: verificare sempre con HR e legal prima della firma.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
