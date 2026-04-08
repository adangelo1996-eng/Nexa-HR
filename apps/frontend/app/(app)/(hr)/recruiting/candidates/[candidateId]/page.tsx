"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getToken } from "@/lib/auth-session";
import { fetchRecruitCandidateDetail } from "@/lib/api";

export default function CandidateDetailPage(): React.JSX.Element {
  const router = useRouter();
  const params = useParams<{ candidateId: string }>();
  const candidateId = params.candidateId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchRecruitCandidateDetail>> | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    setError(null);
    void fetchRecruitCandidateDetail(t, candidateId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Errore caricamento candidato"))
      .finally(() => setLoading(false));
  }, [router, candidateId]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-synapse-text dark:text-white">Candidato</h1>
        <p className="text-sm text-synapse-muted dark:text-[#c8c8c8]">Dettaglio e posizionamento nella selezione.</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link
            href="/recruiting/candidates"
            className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm text-synapse-text hover:bg-[color-mix(in_srgb,var(--prom-gold)_10%,transparent)] dark:text-white"
          >
            Torna a candidati
          </Link>
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
            <CardContent>
              <p className="text-sm text-synapse-muted dark:text-[#c8c8c8] whitespace-pre-wrap">
                {data.candidate.notes?.trim() ? data.candidate.notes : "Nessuna nota."}
              </p>
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
                      <p className="text-xs text-synapse-muted dark:text-[#c8c8c8]">Esito: {s.status}</p>
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

