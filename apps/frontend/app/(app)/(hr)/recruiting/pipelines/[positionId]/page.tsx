"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getToken } from "@/lib/auth-session";
import { createHrStandardContract } from "@/lib/api";
import { createNewContract } from "@/lib/contracts";
import {
  decideRecruitCandidate,
  fetchRecruitBoard,
  moveRecruitCandidateStage,
  type RecruitCandidateDto,
  type RecruitCandidateStageStateDto,
  type RecruitPipelineStageDto
} from "@/lib/api";

type BoardItem = { state: RecruitCandidateStageStateDto; candidate: RecruitCandidateDto };

export default function RecruitingPipelinePage(): React.JSX.Element {
  const router = useRouter();
  const params = useParams<{ positionId: string }>();
  const positionId = params.positionId;

  const [token, setToken] = useState<string | null>(null);
  const [stages, setStages] = useState<RecruitPipelineStageDto[]>([]);
  const [items, setItems] = useState<BoardItem[]>([]);
  const [positionTitle, setPositionTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setToken(t);
    setLoading(true);
    setError(null);
    void fetchRecruitBoard(t, positionId)
      .then((b) => {
        setStages(b.stages);
        setItems(b.items);
        setPositionTitle(b.position.title);
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
      const updated = await moveRecruitCandidateStage(token, { stateId, nextStageId });
      setItems((prev) =>
        prev.map((it) => (it.state.id === updated.id ? { ...it, state: { ...it.state, current_stage_id: updated.current_stage_id } } : it))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore spostamento");
    }
  }

  async function onDecision(stateId: string, status: "in_progress" | "passed" | "failed"): Promise<void> {
    if (!token) return;
    setError(null);
    try {
      const updated = await decideRecruitCandidate(token, { stateId, status });
      setItems((prev) => prev.map((it) => (it.state.id === updated.id ? { ...it, state: { ...it.state, status: updated.status } } : it)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore decisione");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-synapse-text dark:text-white">Pipeline</h1>
        <p className="text-sm text-synapse-muted dark:text-[#c8c8c8]">
          Sposta i candidati tra fasi e registra esito (MVP).
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
                    <p className="text-xs text-synapse-muted dark:text-[#c8c8c8]">Nessuno.</p>
                  ) : (
                    <ul className="space-y-2">
                      {stageItems.map((it) => (
                        <li key={it.state.id} className="rounded-lg border border-[var(--card-border)] p-2">
                          <p className="text-sm font-medium text-synapse-text dark:text-white">
                            {it.candidate.first_name} {it.candidate.last_name}
                          </p>
                          <p className="text-[11px] text-synapse-muted dark:text-[#c8c8c8]">
                            {it.candidate.email ?? "—"}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <select
                              value={it.state.current_stage_id}
                              onChange={(e) => void onMove(it.state.id, e.target.value)}
                              className="w-full rounded-md border border-slate-300/90 bg-white/90 px-2 py-1 text-xs text-synapse-text outline-none transition dark:border-white/15 dark:bg-[#141414]/90 dark:text-white"
                            >
                              {stages.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.name}
                                </option>
                              ))}
                            </select>
                            <div className="flex w-full flex-wrap gap-2">
                              <Button type="button" size="sm" variant="secondary" onClick={() => void onDecision(it.state.id, "in_progress")}>
                                In corso
                              </Button>
                              <Button type="button" size="sm" onClick={() => void onDecision(it.state.id, "passed")}>
                                Avanza
                              </Button>
                              <Button type="button" size="sm" variant="secondary" onClick={() => void onDecision(it.state.id, "failed")}>
                                Scarta
                              </Button>
                            </div>
                            <p className="text-[11px] text-synapse-muted">Esito: {it.state.status}</p>
                            {(() => {
                              const st = stageById.get(it.state.current_stage_id);
                              const isHired = st?.stage_kind === "hired" || st?.name.toLowerCase().includes("assunt");
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

