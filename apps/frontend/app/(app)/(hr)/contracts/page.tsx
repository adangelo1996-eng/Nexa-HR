"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getToken } from "@/lib/auth-session";
import { createHrStandardContract, deleteHrStandardContract, fetchHrStandardContracts } from "@/lib/api";
import { createNewContract, type ContractPartyInfo, type HrContractDoc } from "@/lib/contracts";

function shortIso(iso: string): string {
  return iso.slice(0, 10);
}

export default function ContractsListPage(): React.JSX.Element {
  const router = useRouter();
  const [contracts, setContracts] = useState<HrContractDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [party, setParty] = useState<ContractPartyInfo>({
    companyLegalName: "Azienda",
    companyAddress: "",
    employeeFirstName: "",
    employeeLastName: "",
    employeeAddress: "",
    roleTitle: "",
    workLocation: "",
    startDateIso: "",
    ralEuros: 35_000,
    payMonthsPerYear: 13
  });

  const reload = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchHrStandardContracts(token);
      setContracts(
        rows.map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          party: r.party as unknown as ContractPartyInfo,
          blocks: r.blocks as unknown as HrContractDoc["blocks"],
          lastExportedDocumentId: r.lastExportedDocumentId,
          recruitCandidateId: r.recruitCandidateId,
          recruitPositionId: r.recruitPositionId
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento contratti");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-synapse-text dark:text-white">Contratti standard</h1>
        <p className="text-sm text-synapse-muted dark:text-[#c8c8c8]">
          Crea un contratto indeterminato a blocchi, modifica il contenuto e poi esporta in PDF. I dati sono salvati sul server.
        </p>
      </header>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Nuovo contratto</CardTitle>
          <CardDescription>Campi base per precompilazione. Puoi modificare tutto nell’editor.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#c8c8c8]">Ragione sociale</span>
              <Input
                value={party.companyLegalName}
                onChange={(e) => setParty((p) => ({ ...p, companyLegalName: e.target.value }))}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#c8c8c8]">Indirizzo azienda</span>
              <Input
                value={party.companyAddress ?? ""}
                onChange={(e) => setParty((p) => ({ ...p, companyAddress: e.target.value }))}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#c8c8c8]">Nome</span>
              <Input
                value={party.employeeFirstName}
                onChange={(e) => setParty((p) => ({ ...p, employeeFirstName: e.target.value }))}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#c8c8c8]">Cognome</span>
              <Input
                value={party.employeeLastName}
                onChange={(e) => setParty((p) => ({ ...p, employeeLastName: e.target.value }))}
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-synapse-muted dark:text-[#c8c8c8]">Indirizzo lavoratore</span>
              <Input
                value={party.employeeAddress ?? ""}
                onChange={(e) => setParty((p) => ({ ...p, employeeAddress: e.target.value }))}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#c8c8c8]">Mansione</span>
              <Input value={party.roleTitle ?? ""} onChange={(e) => setParty((p) => ({ ...p, roleTitle: e.target.value }))} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#c8c8c8]">Sede di lavoro</span>
              <Input
                value={party.workLocation ?? ""}
                onChange={(e) => setParty((p) => ({ ...p, workLocation: e.target.value }))}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#c8c8c8]">Data inizio</span>
              <Input
                type="date"
                value={(party.startDateIso ?? "").slice(0, 10)}
                onChange={(e) => setParty((p) => ({ ...p, startDateIso: e.target.value }))}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#c8c8c8]">RAL</span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={100}
                value={party.ralEuros ?? 0}
                onChange={(e) => setParty((p) => ({ ...p, ralEuros: Number(e.target.value) }))}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#c8c8c8]">Mensilità</span>
              <select
                value={party.payMonthsPerYear ?? 13}
                onChange={(e) => setParty((p) => ({ ...p, payMonthsPerYear: Number(e.target.value) as 12 | 13 | 14 }))}
                className="w-full rounded-lg border border-slate-300/90 bg-white/90 px-3 py-2 text-sm text-synapse-text shadow-sm outline-none transition dark:border-white/15 dark:bg-[#141414]/90 dark:text-white"
              >
                <option value={12}>12</option>
                <option value={13}>13</option>
                <option value={14}>14</option>
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={
                creating ||
                !party.employeeFirstName.trim() ||
                !party.employeeLastName.trim() ||
                !party.companyLegalName.trim()
              }
              onClick={() => {
                const token = getToken();
                if (!token) {
                  router.replace("/login");
                  return;
                }
                setCreating(true);
                setError(null);
                const draft = createNewContract(party);
                void createHrStandardContract(token, {
                  title: draft.title,
                  party: { ...draft.party },
                  blocks: draft.blocks as unknown[]
                })
                  .then((created) => {
                    router.push(`/contracts/${encodeURIComponent(created.id)}`);
                  })
                  .catch((e) => setError(e instanceof Error ? e.message : "Errore creazione contratto"))
                  .finally(() => setCreating(false));
              }}
            >
              {creating ? "Creazione…" : "Crea contratto"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void reload()} disabled={loading}>
              Aggiorna elenco
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Elenco contratti</CardTitle>
          <CardDescription>Bozze e contratti salvati per la tua azienda.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-synapse-muted dark:text-[#c8c8c8]">Caricamento…</p>
          ) : contracts.length === 0 ? (
            <p className="text-sm text-synapse-muted dark:text-[#c8c8c8]">Nessun contratto creato.</p>
          ) : (
            <ul className="space-y-2">
              {contracts.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--prom-surface)] p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-synapse-text dark:text-white">{c.title}</p>
                    <p className="text-xs text-synapse-muted dark:text-[#c8c8c8]">
                      {c.status.toUpperCase()} • aggiornato {shortIso(c.updatedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/contracts/${encodeURIComponent(c.id)}`}
                      className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm text-synapse-text hover:bg-[color-mix(in_srgb,var(--prom-gold)_10%,transparent)] dark:text-white"
                    >
                      Apri editor
                    </Link>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        if (!window.confirm("Eliminare il contratto?")) return;
                        const token = getToken();
                        if (!token) {
                          router.replace("/login");
                          return;
                        }
                        void deleteHrStandardContract(token, c.id)
                          .then(() => void reload())
                          .catch((e) => setError(e instanceof Error ? e.message : "Errore eliminazione"));
                      }}
                    >
                      Elimina
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
