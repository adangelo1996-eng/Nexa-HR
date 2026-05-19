"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LinkedInSyncBadge } from "@/components/recruiting/linkedin-sync-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getToken } from "@/lib/auth-session";
import {
  createHrStandardContract,
  decideRecruitCandidate,
  fetchRecruitBoard,
  fetchRecruitPosition,
  moveRecruitCandidateStage,
  publishRecruitPositionToLinkedIn,
  syncRecruitPositionLinkedIn,
  type RecruitPositionDto,
  screenRecruitCandidateCv,
  undoRecruitLastMove,
  type RecruitCandidateDto,
  type RecruitCandidateStageStateDto,
  type RecruitPipelineStageDto
} from "@/lib/api";
import { ScreeningScoreBadge } from "@/components/recruiting/screening-score-badge";
import { createNewContract } from "@/lib/contracts";

type BoardItem = {
  state: RecruitCandidateStageStateDto;
  candidate: RecruitCandidateDto;
  can_undo_last_move: boolean;
};

export default function RecruitingPipelinePage(): React.JSX.Element {
  const router = useRouter();
  const params = useParams<{ positionId: string }>();
  const positionId = params.positionId;

  const [token, setToken] = useState<string | null>(null);
  const [stages, setStages] = useState<RecruitPipelineStageDto[]>([]);
  const [items, setItems] = useState<BoardItem[]>([]);
  const [positionTitle, setPositionTitle] = useState("");
  const [positionMeta, setPositionMeta] = useState<RecruitPositionDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkedInBusy, setLinkedInBusy] = useState(false);
  const [screeningStateId, setScreeningStateId] = useState<string | null>(null);

  const reloadBoard = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) return;
    const b = await fetchRecruitBoard(t, positionId);
    setStages(b.stages);
    setItems(
      b.items.map((row) => ({
        ...row,
        can_undo_last_move: row.can_undo_last_move ?? false
      }))
    );
    setPositionTitle(b.position.title);
  }, [positionId]);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setToken(t);
    setLoading(true);
    setError(null);
    void Promise.all([fetchRecruitBoard(t, positionId), fetchRecruitPosition(t, positionId)])
      .then(([b, pos]) => {
        setStages(b.stages);
        setItems(
          b.items.map((row) => ({
            ...row,
            can_undo_last_move: row.can_undo_last_move ?? false
          }))
        );
        setPositionTitle(b.position.title);
        setPositionMeta(pos);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Errore caricamento pipeline"))
      .finally(() => setLoading(false));
  }, [router, positionId]);

  const itemsByStage = useMemo(() => {
    const map = new Map<string, BoardItem[]>();
    for (const s of stages) map.set(s.id, []);
    for (const it of items) {
      const arr = map.get(it.state.current_stage_id) ?? [];
      arr.push(it);
      map.set(it.state.current_stage_id, arr);
    }
    return map;
  }, [stages, items]);

  const stageById = useMemo(() => {
    const m = new Map<string, RecruitPipelineStageDto>();
    for (const s of stages) m.set(s.id, s);
    return m;
  }, [stages]);

  async function onMove(stateId: string, nextStageId: string): Promise<void> {
    if (!token) return;
    setError(null);
    try {
      await moveRecruitCandidateStage(token, { stateId, nextStageId });
      await reloadBoard();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore spostamento");
    }
  }

  async function onDecision(stateId: string, status: "in_progress" | "passed" | "failed"): Promise<void> {
    if (!token) return;
    setError(null);
    try {
      await decideRecruitCandidate(token, { stateId, status });
      await reloadBoard();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore decisione");
    }
  }

  async function onScreenCv(candidateId: string, stateId: string): Promise<void> {
    if (!token) return;
    setError(null);
    setScreeningStateId(stateId);
    try {
      await screenRecruitCandidateCv(token, candidateId, { positionId });
      await reloadBoard();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore screening CV");
    } finally {
      setScreeningStateId(null);
    }
  }

  async function onUndoMove(stateId: string): Promise<void> {
    if (!token) return;
    setError(null);
    try {
      await undoRecruitLastMove(token, stateId);
      await reloadBoard();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore annullamento spostamento");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-synapse-text dark:text-white">
            Pipeline{positionTitle ? `: ${positionTitle}` : ""}
          </h1>
          {positionMeta ? <LinkedInSyncBadge position={positionMeta} /> : null}
        </div>
        <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">
          Schede compatte: espandi per spostare fase, avanzare (con passaggio automatico alla colonna successiva su
          «Avanza») o annullare l’ultimo spostamento.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link
            href="/recruiting"
            className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm text-synapse-text hover:bg-[color-mix(in_srgb,var(--prom-gold)_10%,transparent)] dark:text-white"
          >
            Torna al hub
          </Link>
          <Link
            href="/recruiting/candidates"
            className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm text-synapse-text hover:bg-[color-mix(in_srgb,var(--prom-gold)_10%,transparent)] dark:text-white"
          >
            Aggiungi candidati
          </Link>
          {token && positionMeta ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={linkedInBusy}
              onClick={() => {
                setLinkedInBusy(true);
                setError(null);
                const action =
                  positionMeta.linkedin_sync_status === "synced"
                    ? syncRecruitPositionLinkedIn(token, positionId)
                    : publishRecruitPositionToLinkedIn(token, positionId);
                void action
                  .then(setPositionMeta)
                  .catch((e) => setError(e instanceof Error ? e.message : "Errore sync LinkedIn"))
                  .finally(() => setLinkedInBusy(false));
              }}
            >
              {positionMeta.linkedin_sync_status === "synced" ? "Sincronizza ora" : "Pubblica su LinkedIn"}
            </Button>
          ) : null}
          {positionMeta?.linkedin_job_url ? (
            <a
              href={positionMeta.linkedin_job_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm text-[#002D72] hover:underline dark:text-sky-200"
            >
              Apri su LinkedIn
            </a>
          ) : null}
        </div>
      </header>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-synapse-muted">Caricamento…</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-4">
          {stages.map((s) => {
            const stageItems = itemsByStage.get(s.id) ?? [];
            return (
              <Card key={s.id} className="min-h-[220px]">
                <CardHeader>
                  <CardTitle className="text-base">{s.name}</CardTitle>
                  <CardDescription>{stageItems.length} candidati</CardDescription>
                </CardHeader>
                <CardContent>
                  {stageItems.length === 0 ? (
                    <p className="text-xs text-synapse-muted dark:text-[#b4c9dc]">Nessuno.</p>
                  ) : (
                    <ul className="space-y-2">
                      {stageItems.map((it) => (
                        <li key={it.state.id} className="rounded-lg border border-[var(--card-border)] p-0">
                          <details className="group rounded-lg">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-2 [&::-webkit-details-marker]:hidden">
                              <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium text-synapse-text dark:text-white">
                                {it.candidate.first_name} {it.candidate.last_name}
                                <ScreeningScoreBadge score={it.state.candidate_cv_screening_score} compact />
                              </span>
                              <span className="shrink-0 text-[10px] text-synapse-muted dark:text-[#b4c9dc]">
                                {it.state.status}
                              </span>
                            </summary>
                            <div className="space-y-2 border-t border-[var(--card-border)] px-2 pb-2 pt-2">
                              <p className="text-[11px] text-synapse-muted dark:text-[#b4c9dc]">
                                {it.candidate.email ?? "—"}
                              </p>
                              <Link
                                href={`/recruiting/candidates/${encodeURIComponent(it.candidate.id)}`}
                                className="text-[11px] underline text-synapse-text dark:text-white"
                              >
                                Scheda candidato
                              </Link>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={screeningStateId === it.state.id}
                                onClick={() => void onScreenCv(it.candidate.id, it.state.id)}
                              >
                                {screeningStateId === it.state.id ? "Screening…" : "Riesegui screening CV"}
                              </Button>
                              <select
                                value={it.state.current_stage_id}
                                onChange={(e) => void onMove(it.state.id, e.target.value)}
                                className="w-full rounded-md border border-slate-300/90 bg-white/90 px-2 py-1 text-xs text-synapse-text outline-none transition dark:border-white/15 dark:bg-[#052642]/90 dark:text-white"
                              >
                                {stages.map((opt) => (
                                  <option key={opt.id} value={opt.id}>
                                    {opt.name}
                                  </option>
                                ))}
                              </select>
                              <div className="flex flex-wrap gap-2">
                                <Button type="button" size="sm" variant="secondary" onClick={() => void onDecision(it.state.id, "in_progress")}>
                                  In corso
                                </Button>
                                <Button type="button" size="sm" onClick={() => void onDecision(it.state.id, "passed")}>
                                  Avanza
                                </Button>
                                <Button type="button" size="sm" variant="secondary" onClick={() => void onDecision(it.state.id, "failed")}>
                                  Respingi
                                </Button>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={!it.can_undo_last_move}
                                onClick={() => void onUndoMove(it.state.id)}
                              >
                                Annulla ultimo spostamento
                              </Button>
                              <p className="text-[11px] text-synapse-muted">Esito: {it.state.status}</p>
                              {(() => {
                                const st = stageById.get(it.state.current_stage_id);
                                const isHired =
                                  st?.stage_kind === "hired" ||
                                  st?.stage_kind === "onboarding" ||
                                  st?.name.toLowerCase().includes("assunt");
                                if (!isHired) return null;
                                return (
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => {
                                      if (!token) return;
                                      setError(null);
                                      const draft = createNewContract({
                                        companyLegalName: "Azienda",
                                        employeeFirstName: it.candidate.first_name,
                                        employeeLastName: it.candidate.last_name,
                                        roleTitle: positionTitle || "Posizione",
                                        payMonthsPerYear: 13
                                      });
                                      void createHrStandardContract(token, {
                                        title: draft.title,
                                        party: { ...draft.party },
                                        blocks: draft.blocks as unknown[],
                                        recruitCandidateId: it.candidate.id,
                                        recruitPositionId: positionId
                                      })
                                        .then((created) => {
                                          router.push(`/contracts/${encodeURIComponent(created.id)}`);
                                        })
                                        .catch((e) =>
                                          setError(e instanceof Error ? e.message : "Errore creazione contratto")
                                        );
                                    }}
                                  >
                                    Genera contratto
                                  </Button>
                                );
                              })()}
                            </div>
                          </details>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
