"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchHrStandardContract, patchHrStandardContract, uploadDocumentToVault } from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { hrContractFromApi, type HrContractDoc } from "@/lib/contracts";
import { renderContractToPdf } from "@/lib/pdf/contract-pdf";

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
        <p className="text-sm text-synapse-muted dark:text-[#c8c8c8]">Caricamento contratto…</p>
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

  async function onExportPdf(): Promise<void> {
    if (!localDoc) return;
    const token = getToken();
    setExporting(true);
    setError(null);
    setMsg(null);
    try {
      const blob = renderContractToPdf(localDoc);

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${localDoc.title.replace(/[^\w\- ]+/g, "").slice(0, 60) || "contratto"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      if (token) {
        const b64 = await b64FromBlob(blob);
        const uploaded = await uploadDocumentToVault(token, {
          title: `${localDoc.title} (PDF)`,
          kind: "contract",
          mimeType: "application/pdf",
          bodyBase64: b64
        });
        const updated = await patchHrStandardContract(token, localDoc.id, {
          status: "exported",
          lastExportedDocumentId: uploaded.id
        });
        setLocalDoc(hrContractFromApi(updated));
        setMsg("PDF esportato e caricato nel vault documenti.");
      } else {
        router.replace("/login");
      }
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
        <p className="text-sm text-synapse-muted dark:text-[#c8c8c8]">
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
              <span className="text-synapse-muted dark:text-[#c8c8c8]">Ragione sociale</span>
              <Input
                disabled={!canEdit}
                value={localDoc.party.companyLegalName}
                onChange={(e) =>
                  setLocalDoc((d) => (d ? { ...d, party: { ...d.party, companyLegalName: e.target.value } } : d))
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#c8c8c8]">Nome</span>
              <Input
                disabled={!canEdit}
                value={localDoc.party.employeeFirstName}
                onChange={(e) =>
                  setLocalDoc((d) => (d ? { ...d, party: { ...d.party, employeeFirstName: e.target.value } } : d))
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#c8c8c8]">Cognome</span>
              <Input
                disabled={!canEdit}
                value={localDoc.party.employeeLastName}
                onChange={(e) =>
                  setLocalDoc((d) => (d ? { ...d, party: { ...d.party, employeeLastName: e.target.value } } : d))
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#c8c8c8]">RAL</span>
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
            <Button type="button" onClick={() => void onExportPdf()} disabled={exporting}>
              {exporting ? "Export…" : "Esporta PDF"}
            </Button>
          </div>

          {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
          {msg ? <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">{msg}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Blocchi contratto</CardTitle>
          <CardDescription>Macro sezioni modificabili.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {localDoc.blocks.map((b, idx) => (
              <div key={b.key} className="rounded-lg border border-[var(--card-border)] bg-[var(--prom-surface)] p-3">
                <p className="text-sm font-medium text-synapse-text dark:text-white">{b.title}</p>
                <textarea
                  className="mt-2 min-h-[120px] w-full resize-y rounded-lg border border-slate-300/90 bg-white/90 p-3 text-sm text-synapse-text shadow-sm outline-none transition dark:border-white/15 dark:bg-[#141414]/90 dark:text-white"
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
