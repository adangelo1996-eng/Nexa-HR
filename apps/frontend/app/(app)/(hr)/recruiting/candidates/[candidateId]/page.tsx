"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Route } from "next";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getToken } from "@/lib/auth-session";
import {
  deleteRecruitCandidate,
  deleteRecruitCandidateDocument,
  downloadRecruitCandidateDocumentFile,
  exportRecruitCandidateJson,
  fetchRecruitCandidateDetail,
  fetchRecruitCandidateDocuments,
  startHrOnboardingFromCandidate,
  uploadRecruitCandidateDocument
} from "@/lib/api";

export default function CandidateDetailPage(): React.JSX.Element {
  const router = useRouter();
  const params = useParams<{ candidateId: string }>();
  const candidateId = params.candidateId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchRecruitCandidateDetail>> | null>(null);
  const [docs, setDocs] = useState<Awaited<ReturnType<typeof fetchRecruitCandidateDocuments>>>([]);
  const [token, setToken] = useState<string | null>(null);
  const [startingOnboarding, setStartingOnboarding] = useState(false);

  const reload = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) return;
    setToken(t);
    const [detail, documents] = await Promise.all([
      fetchRecruitCandidateDetail(t, candidateId),
      fetchRecruitCandidateDocuments(t, candidateId).catch(() => [])
    ]);
    setData(detail);
    setDocs(documents);
  }, [candidateId]);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setToken(t);
    setLoading(true);
    setError(null);
    void Promise.all([
      fetchRecruitCandidateDetail(t, candidateId),
      fetchRecruitCandidateDocuments(t, candidateId).catch(() => [])
    ])
      .then(([detail, documents]) => {
        setData(detail);
        setDocs(documents);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Errore caricamento candidato"))
      .finally(() => setLoading(false));
  }, [router, candidateId]);

  async function onExport(): Promise<void> {
    if (!token) return;
    setError(null);
    try {
      const json = await exportRecruitCandidateJson(token, candidateId);
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `candidato-${candidateId}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore export");
    }
  }

  async function onDeleteCandidate(): Promise<void> {
    if (!token) return;
    if (!globalThis.confirm("Eliminare definitivamente il candidato e i relativi allegati? Operazione irreversibile.")) {
      return;
    }
    setError(null);
    try {
      await deleteRecruitCandidate(token, candidateId);
      router.replace("/recruiting/candidates");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore eliminazione");
    }
  }

  async function onUploadFile(file: File): Promise<void> {
    if (!token || !file.size) return;
    setError(null);
    try {
      const lower = file.name.toLowerCase();
      const isCv = lower.includes("cv") || lower.includes("curriculum");
      await uploadRecruitCandidateDocument(token, candidateId, file, {
        kind: isCv ? "cv" : "other",
        label: file.name
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore upload");
    }
  }

  async function onDeleteDoc(documentId: string): Promise<void> {
    if (!token) return;
    if (!globalThis.confirm("Rimuovere questo allegato?")) return;
    setError(null);
    try {
      await deleteRecruitCandidateDocument(token, documentId);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore eliminazione documento");
    }
  }

  async function onStartOnboarding(): Promise<void> {
    if (!token) return;
    setStartingOnboarding(true);
    setError(null);
    try {
      const { user } = await startHrOnboardingFromCandidate(token, { candidateId });
      const q = new URLSearchParams({ name: user.fullName || "Dipendente" });
      router.push(`/hr/onboarding/wizard/${encodeURIComponent(user.id)}?${q.toString()}` as Route);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Avvio onboarding non riuscito");
    } finally {
      setStartingOnboarding(false);
    }
  }

  async function onDownloadDoc(documentId: string, label: string): Promise<void> {
    if (!token) return;
    setError(null);
    try {
      await downloadRecruitCandidateDocumentFile(token, documentId, label.replace(/[^\w.\-]+/g, "_") || "file");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore download");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-synapse-text dark:text-white">Candidato</h1>
        <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">Dettaglio, allegati e strumenti privacy.</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link
            href="/recruiting/candidates"
            className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm text-synapse-text hover:bg-[color-mix(in_srgb,var(--prom-gold)_10%,transparent)] dark:text-white"
          >
            Torna a candidati
          </Link>
          <Button
            type="button"
            size="sm"
            disabled={startingOnboarding}
            onClick={() => void onStartOnboarding()}
          >
            {startingOnboarding ? "Avvio…" : "Avvia onboarding"}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => void onExport()}>
            Esporta dati (JSON)
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={() => void onDeleteCandidate()}>
            Elimina candidato
          </Button>
        </div>
      </header>

      {loading ? <p className="text-sm text-synapse-muted">Caricamento…</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {data ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                {data.candidate.first_name} {data.candidate.last_name}
              </CardTitle>
              <CardDescription>
                {data.candidate.email ?? "—"} • {data.candidate.phone ?? "—"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-synapse-muted dark:text-[#b4c9dc] whitespace-pre-wrap">
                {data.candidate.notes?.trim() ? data.candidate.notes : "Nessuna nota."}
              </p>
              {(data.candidate.privacy_notice_version != null && data.candidate.privacy_notice_version !== "") ||
              data.candidate.consent_recorded_at != null ? (
                <div className="rounded-md border border-[var(--card-border)] p-3 text-xs text-synapse-muted dark:text-[#b4c9dc]">
                  {data.candidate.privacy_notice_version ? (
                    <p>Informativa (versione): {data.candidate.privacy_notice_version}</p>
                  ) : null}
                  {data.candidate.consent_recorded_at ? (
                    <p>Consenso registrato: {new Date(data.candidate.consent_recorded_at).toLocaleString("it-IT")}</p>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Allegati</CardTitle>
              <CardDescription>CV, certificati, lettere di presentazione (PDF, Word, immagini).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="block text-sm">
                <span className="text-synapse-muted dark:text-[#b4c9dc]">Carica file</span>
                <input
                  type="file"
                  className="mt-1 w-full text-sm text-synapse-text dark:text-white"
                  accept=".pdf,.doc,.docx,image/png,image/jpeg,application/pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onUploadFile(f);
                    e.target.value = "";
                  }}
                />
              </label>
              {docs.length === 0 ? (
                <p className="text-sm text-synapse-muted">Nessun allegato.</p>
              ) : (
                <ul className="space-y-2">
                  {docs.map((d) => (
                    <li
                      key={d.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--card-border)] p-2 text-sm"
                    >
                      <div>
                        <p className="font-medium text-synapse-text dark:text-white">{d.label}</p>
                        <p className="text-xs text-synapse-muted">
                          {d.kind} · {d.byte_size != null ? `${Math.round(d.byte_size / 1024)} KB` : "—"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="secondary" onClick={() => void onDownloadDoc(d.id, d.label)}>
                          Scarica
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => void onDeleteDoc(d.id)}>
                          Elimina
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Selezioni in corso</CardTitle>
              <CardDescription>Posizioni a cui è associato il candidato.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.states.length === 0 ? (
                <p className="text-sm text-synapse-muted">Non associato a posizioni.</p>
              ) : (
                <ul className="space-y-2">
                  {data.states.map((s) => (
                    <li key={s.state_id} className="rounded-lg border border-[var(--card-border)] p-3">
                      <p className="text-sm font-medium text-synapse-text dark:text-white">{s.position_title}</p>
                      <p className="text-xs text-synapse-muted dark:text-[#b4c9dc]">Esito: {s.status}</p>
                      <div className="mt-2">
                        <Link
                          href={`/recruiting/pipelines/${encodeURIComponent(s.position_id)}`}
                          className="text-sm underline text-synapse-text dark:text-white"
                        >
                          Apri pipeline posizione
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
