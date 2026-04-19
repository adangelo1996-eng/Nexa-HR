"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchHitlProposals,
  postAnalyticsHitlProposalDraft,
  postHitlProposal,
  postHitlProposalDecision
} from "@/lib/api";
import { getSessionUser, getToken, sessionCanUseNexaAiOpenAiLlm } from "@/lib/auth-session";
import { HITL_PROPOSAL_KIND_CATALOG } from "@/lib/hitl-proposal-kinds";
import { Button } from "@/components/ui/button";
import {
  HebbAiErrorBanner,
  HebbAiExperienceShell,
  HebbAiGlassPanel,
  HebbAiGlassTile
} from "@/components/hebb-ai-experience-shell";
import { HebbAiPageHelpButton } from "@/components/hebb-ai-page-help-button";
import { Textarea } from "@/components/ui/textarea";

type Step = "intro" | "compose" | "review";

type HitlItem = Awaited<ReturnType<typeof fetchHitlProposals>>["items"][number];

export default function HitlProposalsPage(): React.JSX.Element {
  const [items, setItems] = useState<HitlItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("intro");
  const [intent, setIntent] = useState("");
  const [kind, setKind] = useState<string>(HITL_PROPOSAL_KIND_CATALOG[0]!.id);
  const [title, setTitle] = useState("");
  const [rationale, setRationale] = useState("");
  const [checklist, setChecklist] = useState<string[]>([]);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftLlm, setDraftLlm] = useState(true);
  const [lastDraftLlm, setLastDraftLlm] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) {
      return;
    }
    setError(null);
    try {
      const res = await fetchHitlProposals(t);
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kindMeta = useMemo(
    () => HITL_PROPOSAL_KIND_CATALOG.find((k) => k.id === kind) ?? HITL_PROPOSAL_KIND_CATALOG[0]!,
    [kind]
  );

  const runDraftAi = async (): Promise<void> => {
    const t = getToken();
    if (!t || !intent.trim()) {
      setError("Descrivi prima cosa vuoi proporre (passo 2).");
      return;
    }
    setDraftBusy(true);
    setError(null);
    try {
      const r = await postAnalyticsHitlProposalDraft(t, {
        intent: intent.trim(),
        useLlm: draftLlm && sessionCanUseNexaAiOpenAiLlm(getSessionUser())
      });
      setKind(r.kind);
      setTitle(r.title);
      setRationale(r.rationale);
      setChecklist(r.checklist.length ? r.checklist : checklist);
      setLastDraftLlm(r.llmApplied);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bozza non disponibile");
    } finally {
      setDraftBusy(false);
    }
  };

  const submitProposal = async (): Promise<void> => {
    const t = getToken();
    if (!t) {
      return;
    }
    setError(null);
    try {
      await postHitlProposal(t, {
        kind,
        payload: {
          source: "hitl_wizard_v1",
          checklist,
          draftTitle: title || undefined
        },
        rationale: rationale.trim() || intent.trim() || "Proposta dalla coda con revisione umana."
      });
      setIntent("");
      setTitle("");
      setRationale("");
      setChecklist([]);
      setStep("intro");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Creazione fallita");
    }
  };

  const decide = async (id: string, approve: boolean): Promise<void> => {
    const t = getToken();
    if (!t) {
      return;
    }
    setError(null);
    try {
      await postHitlProposalDecision(t, id, approve);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Decisione fallita");
    }
  };

  return (
    <HebbAiExperienceShell
      contentMax="standard"
      title="Proposte operative con revisione umana"
      subtitle="Metti in coda un’azione a basso rischio: un collega autorizzato approva o rifiuta prima dell’esecuzione. Qui non si modificano cedolini o contratti in automatico."
      headerTrailing={<HebbAiPageHelpButton pageKey="hitl-proposals" />}
    >
      {error ? <HebbAiErrorBanner>{error}</HebbAiErrorBanner> : null}

      <HebbAiGlassPanel>
        <h2 className="font-synapse text-lg font-semibold text-[var(--prom-text)]">Percorso guidato</h2>
        <ol className="mt-4 space-y-3 text-sm text-[var(--prom-muted)]">
          <li className={step === "intro" ? "font-medium text-[var(--prom-text)]" : ""}>
            <strong>1.</strong> Capire cosa puoi mettere in coda
          </li>
          <li className={step === "compose" ? "font-medium text-[var(--prom-text)]" : ""}>
            <strong>2.</strong> Scrivere l’intento e (opzionale) generare bozza con AI
          </li>
          <li className={step === "review" ? "font-medium text-[var(--prom-text)]" : ""}>
            <strong>3.</strong> Controllare e inviare
          </li>
        </ol>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={step === "intro" ? "primary" : "outline"} onClick={() => setStep("intro")}>
            Passo 1
          </Button>
          <Button type="button" size="sm" variant={step === "compose" ? "primary" : "outline"} onClick={() => setStep("compose")}>
            Passo 2
          </Button>
          <Button type="button" size="sm" variant={step === "review" ? "primary" : "outline"} onClick={() => setStep("review")} disabled={!rationale.trim() && !intent.trim()}>
            Passo 3
          </Button>
        </div>
      </HebbAiGlassPanel>

      {step === "intro" ? (
        <HebbAiGlassPanel>
          <h2 className="font-synapse text-lg font-semibold text-[var(--prom-text)]">Cosa succede qui</h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--prom-muted)]">
            Le proposte sono messaggi strutturati per il team HR o i responsabili: servono a coordinare promemoria e
            solleciti legati a ferie, approvazioni o percorsi self-service. Dopo l’invio, un revisore umano vede lo
            stato <strong>proposed</strong> e decide se approvare o rifiutare.
          </p>
          <p className="mt-4 text-sm text-[var(--prom-muted)]">Tipi disponibili oggi:</p>
          <ul className="mt-2 space-y-2 text-sm text-[var(--prom-text)]">
            {HITL_PROPOSAL_KIND_CATALOG.map((k) => (
              <li key={k.id} className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] px-3 py-2">
                <span className="font-semibold">{k.labelIt}</span>
                <span className="ml-2 text-xs text-[var(--prom-muted)]">({k.id})</span>
                <p className="mt-1 text-xs text-[var(--prom-muted)]">{k.hintIt}</p>
              </li>
            ))}
          </ul>
          <Button type="button" className="mt-6" onClick={() => setStep("compose")}>
            Continua al passo 2
          </Button>
        </HebbAiGlassPanel>
      ) : null}

      {step === "compose" ? (
        <HebbAiGlassPanel>
          <h2 className="font-synapse text-lg font-semibold text-[var(--prom-text)]">Descrivi l’intento</h2>
          <p className="mt-2 text-sm text-[var(--prom-muted)]">
            Scrivi in italiano cosa serve (destinatari, urgenza, canale). Evita codici fiscali o dati sanitari se non
            necessari.
          </p>
          <Textarea
            className="mt-4 min-h-[140px] rounded-xl border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] text-sm"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder="Es.: vorrei un promemoria gentile ai colleghi del team X con ferie residue basse prima delle ferie di agosto…"
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]" htmlFor="hitl-kind">
              Tipo (puoi cambiarlo dopo la bozza)
            </label>
            <select
              id="hitl-kind"
              className="rounded-xl border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] px-3 py-2 text-sm text-[var(--prom-text)]"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {HITL_PROPOSAL_KIND_CATALOG.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.labelIt}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-2 text-xs text-[var(--prom-muted)]">{kindMeta.hintIt}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {sessionCanUseNexaAiOpenAiLlm(getSessionUser()) ? (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--prom-muted)]">
                <input type="checkbox" checked={draftLlm} onChange={(e) => setDraftLlm(e.target.checked)} />
                Genera bozza con AI (testo e checklist)
              </label>
            ) : (
              <span className="text-xs text-[var(--prom-muted)]">AI non attiva su questo ambiente: usa bozza manuale al passo 3.</span>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={draftBusy || !intent.trim()}
              onClick={() => {
                setRationale(intent.trim());
                setTitle(`${kindMeta.labelIt} — bozza manuale`);
                setChecklist([
                  "Verifica destinatari e permessi.",
                  "Controlla che il tipo «" + kind + "» sia quello corretto prima dell’invio."
                ]);
                setLastDraftLlm(false);
                setStep("review");
              }}
            >
              Salta AI — compilo al passo 3
            </Button>
            <Button type="button" disabled={draftBusy || !intent.trim()} onClick={() => void runDraftAi()}>
              {draftBusy ? "Generazione…" : "Genera bozza con AI"}
            </Button>
          </div>
        </HebbAiGlassPanel>
      ) : null}

      {step === "review" ? (
        <HebbAiGlassPanel>
          <h2 className="font-synapse text-lg font-semibold text-[var(--prom-text)]">Revisione e invio</h2>
          <div className="mt-4 space-y-3 text-sm">
            <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]" htmlFor="hitl-title">
              Titolo interno (opzionale)
            </label>
            <input
              id="hitl-title"
              className="w-full rounded-xl border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] px-3 py-2 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Es. Promemoria ferie — team vendite"
            />
            <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]" htmlFor="hitl-rat">
              Motivazione per il revisore
            </label>
            <Textarea
              id="hitl-rat"
              className="min-h-[120px] rounded-xl border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] text-sm"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Testo che il revisore leggerà prima di approvare…"
            />
            <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]" htmlFor="hitl-kind2">
              Tipo tecnico
            </label>
            <select
              id="hitl-kind2"
              className="w-full rounded-xl border border-[var(--prom-line-strong)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] px-3 py-2 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {HITL_PROPOSAL_KIND_CATALOG.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.labelIt} ({k.id})
                </option>
              ))}
            </select>
            {checklist.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Checklist</p>
                <ul className="mt-2 list-inside list-disc text-[var(--prom-muted)]">
                  {checklist.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {lastDraftLlm ? (
              <p className="text-xs text-[var(--prom-muted)]">Ultima bozza: AI applicata (audit registrato).</p>
            ) : null}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setStep("compose")}>
              Torna al testo
            </Button>
            <Button type="button" onClick={() => void submitProposal()} disabled={!rationale.trim() && !intent.trim()}>
              Invia in coda
            </Button>
          </div>
        </HebbAiGlassPanel>
      ) : null}

      <HebbAiGlassPanel>
        <h2 className="font-synapse text-lg font-semibold text-[var(--prom-text)]">Coda attuale</h2>
        {items.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--prom-muted)]">Nessuna proposta in elenco.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {items.map((it) => (
              <li key={it.id}>
                <HebbAiGlassTile>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-mono text-[var(--prom-muted)]">{it.id}</p>
                      <p className="mt-1 font-semibold text-[var(--prom-text)]">{it.kind}</p>
                      <p className="mt-2 text-sm text-[var(--prom-muted)]">{it.rationale}</p>
                      <p className="mt-2 text-xs text-[var(--prom-muted)]">
                        Stato: <strong>{it.status}</strong> — creata {new Date(it.createdAt).toLocaleString("it-IT")}
                      </p>
                    </div>
                    {it.status === "proposed" ? (
                      <div className="flex shrink-0 gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => void decide(it.id, false)}>
                          Rifiuta
                        </Button>
                        <Button type="button" size="sm" onClick={() => void decide(it.id, true)}>
                          Approva
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </HebbAiGlassTile>
              </li>
            ))}
          </ul>
        )}
      </HebbAiGlassPanel>
    </HebbAiExperienceShell>
  );
}
