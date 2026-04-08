"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getToken } from "@/lib/auth-session";
import {
  createRecruitCandidate,
  fetchRecruitCandidates,
  fetchRecruitPositions,
  attachRecruitCandidateToPosition,
  type RecruitCandidateDto,
  type RecruitPositionDto
} from "@/lib/api";

export default function RecruitingCandidatesPage(): React.JSX.Element {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [candidates, setCandidates] = useState<RecruitCandidateDto[]>([]);
  const [positions, setPositions] = useState<RecruitPositionDto[]>([]);
  const [positionId, setPositionId] = useState<string>("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const canCreate = firstName.trim() && lastName.trim();

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setToken(t);
    setLoading(true);
    setError(null);
    void Promise.all([fetchRecruitCandidates(t), fetchRecruitPositions(t)])
      .then(([cand, pos]) => {
        setCandidates(cand);
        setPositions(pos);
        const open = pos.find((p) => p.status === "open");
        setPositionId(open?.id ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Errore caricamento"))
      .finally(() => setLoading(false));
  }, [router]);

  const openPositions = useMemo(() => positions.filter((p) => p.status === "open"), [positions]);

  async function onCreate(): Promise<void> {
    if (!token) return;
    setError(null);
    try {
      const created = await createRecruitCandidate(token, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {})
      });
      setCandidates((prev) => [created, ...prev]);
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setNotes("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore creazione candidato");
    }
  }

  async function onAttach(candidateId: string): Promise<void> {
    if (!token || !positionId) return;
    setError(null);
    try {
      await attachRecruitCandidateToPosition(token, { candidateId, positionId });
      router.push(`/recruiting/pipelines/${encodeURIComponent(positionId)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore associazione candidato");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-synapse-text dark:text-white">Candidati</h1>
        <p className="text-sm text-synapse-muted dark:text-[#c8c8c8]">Anagrafica breve per tracciare la selezione.</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link
            href="/recruiting"
            className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm text-synapse-text hover:bg-[color-mix(in_srgb,var(--prom-gold)_10%,transparent)] dark:text-white"
          >
            Torna al hub
          </Link>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Nuovo candidato</CardTitle>
          <CardDescription>Inserimento rapido (MVP).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#c8c8c8]">Nome</span>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#c8c8c8]">Cognome</span>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#c8c8c8]">Email</span>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-synapse-muted dark:text-[#c8c8c8]">Telefono</span>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-synapse-muted dark:text-[#c8c8c8]">Note</span>
              <textarea
                className="min-h-[90px] w-full resize-y rounded-lg border border-slate-300/90 bg-white/90 p-3 text-sm text-synapse-text shadow-sm outline-none transition dark:border-white/15 dark:bg-[#141414]/90 dark:text-white"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <Button type="button" disabled={!canCreate} onClick={() => void onCreate()}>
              Crea candidato
            </Button>
          </div>
          {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Associa a posizione</CardTitle>
          <CardDescription>Seleziona la posizione aperta da usare per “aggiungi in pipeline”.</CardDescription>
        </CardHeader>
        <CardContent>
          <label className="space-y-1 text-sm">
            <span className="text-synapse-muted dark:text-[#c8c8c8]">Posizione</span>
            <select
              value={positionId}
              onChange={(e) => setPositionId(e.target.value)}
              className="w-full rounded-lg border border-slate-300/90 bg-white/90 px-3 py-2 text-sm text-synapse-text shadow-sm outline-none transition dark:border-white/15 dark:bg-[#141414]/90 dark:text-white"
            >
              <option value="">Seleziona…</option>
              {openPositions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Elenco</CardTitle>
          <CardDescription>Da qui puoi aggiungere un candidato alla pipeline.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-synapse-muted">Caricamento…</p> : null}
          {!loading && candidates.length === 0 ? (
            <p className="text-sm text-synapse-muted dark:text-[#c8c8c8]">Nessun candidato.</p>
          ) : (
            <ul className="space-y-2">
              {candidates.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--prom-surface)] p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-synapse-text dark:text-white">
                      {c.first_name} {c.last_name}
                    </p>
                    <p className="text-xs text-synapse-muted dark:text-[#c8c8c8]">
                      {c.email ?? "—"} • {c.phone ?? "—"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/recruiting/candidates/${encodeURIComponent(c.id)}`}
                      className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm text-synapse-text hover:bg-[color-mix(in_srgb,var(--prom-gold)_10%,transparent)] dark:text-white"
                    >
                      Dettaglio
                    </Link>
                    <Button type="button" disabled={!positionId} onClick={() => void onAttach(c.id)}>
                      Aggiungi in pipeline
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

