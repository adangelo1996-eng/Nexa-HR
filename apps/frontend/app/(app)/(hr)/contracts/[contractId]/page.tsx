"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  exportHrStandardContractPdf,
  fetchHrStandardContract,
  fetchHrStandardContractVersions,
  patchHrStandardContract,
  restoreHrStandardContractVersion,
  signHrStandardContract,
  uploadDocumentToVault
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { CONTRACT_BLOCK_LIBRARY, hrContractFromApi, type HrContractDoc } from "@/lib/contracts";

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
      if (/\{\{[^}]+\}\}/.test(b.content) || /\[[^\]]+\]/.test(b.content)) {
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

  const canEdit = localDoc.status !== "exported";

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
      const errs = validateDoc(localDoc);
      if (errs.length) {
        setError(errs.join(" • "));
        return;
      }
      const updated = await patchHrStandardContract(token, localDoc.id, {
        title: localDoc.title,
        party: { ...localDoc.party },
        blocks: localDoc.blocks as unknown[],
        status: "approved"
      });
      setLocalDoc(hrContractFromApi(updated));
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
      const errs = validateDoc(localDoc);
      if (errs.length) {
        setError(errs.join(" • "));
        return;
      }
      const updated = await signHrStandardContract(token, localDoc.id, {
        companySignerName: signCompany.trim(),
        employeeSignerName: signEmployee.trim()
      });
      setLocalDoc(hrContractFromApi(updated));
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

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-synapse-text dark:text-white">{localDoc.title}</h1>
        <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">
          Stato: <strong className="text-synapse-text dark:text-white">{localDoc.status.toUpperCase()}</strong>
        </p>
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
                disabled={!canEdit}
                value={localDoc.party.companyLegalName}
                onChange={(e) =>
                  setLocalDoc((d) => (d ? { ...d, party: { ...d.party, companyLegalName: e.target.value } } : d))
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#b4c9dc]">Indirizzo azienda</span>
              <Input
                disabled={!canEdit}
                value={localDoc.party.companyAddress ?? ""}
                onChange={(e) =>
                  setLocalDoc((d) => (d ? { ...d, party: { ...d.party, companyAddress: e.target.value } } : d))
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#b4c9dc]">Nome</span>
              <Input
                disabled={!canEdit}
                value={localDoc.party.employeeFirstName}
                onChange={(e) =>
                  setLocalDoc((d) => (d ? { ...d, party: { ...d.party, employeeFirstName: e.target.value } } : d))
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#b4c9dc]">Cognome</span>
              <Input
                disabled={!canEdit}
                value={localDoc.party.employeeLastName}
                onChange={(e) =>
                  setLocalDoc((d) => (d ? { ...d, party: { ...d.party, employeeLastName: e.target.value } } : d))
                }
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-synapse-muted dark:text-[#b4c9dc]">Indirizzo lavoratore</span>
              <Input
                disabled={!canEdit}
                value={localDoc.party.employeeAddress ?? ""}
                onChange={(e) =>
                  setLocalDoc((d) => (d ? { ...d, party: { ...d.party, employeeAddress: e.target.value } } : d))
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#b4c9dc]">Mansione</span>
              <Input
                disabled={!canEdit}
                value={localDoc.party.roleTitle ?? ""}
                onChange={(e) =>
                  setLocalDoc((d) => (d ? { ...d, party: { ...d.party, roleTitle: e.target.value } } : d))
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#b4c9dc]">Sede di lavoro</span>
              <Input
                disabled={!canEdit}
                value={localDoc.party.workLocation ?? ""}
                onChange={(e) =>
                  setLocalDoc((d) => (d ? { ...d, party: { ...d.party, workLocation: e.target.value } } : d))
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#b4c9dc]">Data inizio</span>
              <Input
                disabled={!canEdit}
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
                disabled={!canEdit}
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
                disabled={!canEdit}
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
            <Button type="button" variant="secondary" onClick={() => router.push("/contracts")}>
              Torna a elenco
            </Button>
            <div className="flex-1" />
            <Button type="button" variant="secondary" onClick={() => void onApprove()} disabled={!canEdit}>
              Approva
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void onSign()}
              disabled={!canEdit || localDoc.status !== "approved"}
            >
              Firma
            </Button>
            <Button type="button" onClick={() => void onExportPdfServer()} disabled={exporting || localDoc.status !== "approved"}>
              {exporting ? "Export…" : "Esporta PDF (server)"}
            </Button>
          </div>

          {localDoc.status === "approved" ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-synapse-muted dark:text-[#b4c9dc]">Firmatario azienda</span>
                <Input disabled={!canEdit} value={signCompany} onChange={(e) => setSignCompany(e.target.value)} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-synapse-muted dark:text-[#b4c9dc]">Firmatario lavoratore</span>
                <Input disabled={!canEdit} value={signEmployee} onChange={(e) => setSignEmployee(e.target.value)} />
              </label>
            </div>
          ) : null}

          {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
          {msg ? <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">{msg}</p> : null}
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
              disabled={!canEdit || !addingBlockKey}
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
              <div key={b.key} className="rounded-lg border border-[var(--card-border)] bg-[var(--prom-surface)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-synapse-text dark:text-white">{b.title}</p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!canEdit || idx === 0}
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
                      disabled={!canEdit || idx === localDoc.blocks.length - 1}
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
                      disabled={!canEdit || Boolean(b.locked)}
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
                  disabled={!canEdit || Boolean(b.locked)}
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
    </div>
  );
}
