"use client";

import { useCallback, useState } from "react";
import { HebbAiPageHelpButton } from "@/components/hebb-ai-page-help-button";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/glass-card";
import { postHrCenterContractDraft } from "@/lib/api";
import { getToken } from "@/lib/auth-session";

function renderNarrative(n: unknown): React.JSX.Element {
  const o = n as { envelope?: { title?: string; bullets?: string[]; summary?: string } };
  const e = o?.envelope;
  if (!e) {
    return (
      <pre className="max-h-96 overflow-auto rounded-lg bg-slate-950/80 p-3 text-[11px] text-slate-100">
        {JSON.stringify(n, null, 2)}
      </pre>
    );
  }
  return (
    <div className="space-y-3 text-sm text-[var(--prom-text)]">
      {e.title ? <h3 className="font-semibold">{e.title}</h3> : null}
      {e.bullets?.length ? (
        <ul className="list-inside list-disc space-y-1 text-[var(--prom-muted)]">
          {e.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      ) : null}
      {e.summary ? <p className="leading-relaxed text-[var(--prom-muted)]">{e.summary}</p> : null}
    </div>
  );
}

export default function HrCenterContractsPage(): React.JSX.Element {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facts, setFacts] = useState<Record<string, unknown> | null>(null);
  const [narrative, setNarrative] = useState<unknown>(null);
  const [previewHtml, setPreviewHtml] = useState<string>("");

  const run = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const r = await postHrCenterContractDraft(token);
      setFacts(r.facts);
      setNarrative(r.narrative);
      const o = r.narrative as { envelope?: { title?: string; bullets?: string[]; summary?: string } };
      const e = o?.envelope;
      const parts: string[] = [];
      if (e?.title) parts.push(`<h1>${escapeHtml(e.title)}</h1>`);
      if (e?.bullets?.length) {
        parts.push("<ul>" + e.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("") + "</ul>");
      }
      if (e?.summary) parts.push(`<p>${escapeHtml(e.summary)}</p>`);
      parts.push(
        `<p style="margin-top:2rem;font-size:12px;color:#666;border-top:1px solid #ccc;padding-top:8px">BOZZA — Verificare sempre il testo con HR e legal prima della firma.</p>`
      );
      setPreviewHtml(
        `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Bozza contratto</title></head><body style="font-family:Montserrat,system-ui,sans-serif;padding:24px">${parts.join("")}</body></html>`
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Errore generazione bozza");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      <GlassCard
        title="Contratti standard (bozza LLM)"
        description="Struttura allineata ai template Contratti standard presenti in anagrafica. Anteprima HTML per stampa/PDF dal browser; contenuto da verificare."
      >
        <div className="flex flex-wrap justify-end gap-2">
          <HebbAiPageHelpButton pageKey="hr-center-contratti" />
          <Button type="button" size="sm" disabled={loading} onClick={() => void run()}>
            {loading ? "Generazione…" : "Genera bozza"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!previewHtml}
            onClick={() => {
              if (!previewHtml) return;
              const w = window.open("", "_blank", "noopener,noreferrer");
              if (w) {
                w.document.open();
                w.document.write(previewHtml);
                w.document.close();
              }
            }}
          >
            Apri anteprima stampa
          </Button>
        </div>
        {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        {facts ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase text-[var(--prom-muted)]">Contesto template</h4>
              <pre className="max-h-64 overflow-auto rounded-lg border border-[var(--prom-line)] p-3 text-[11px]">
                {JSON.stringify(facts, null, 2)}
              </pre>
            </div>
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase text-[var(--prom-muted)]">Sintesi strutturata</h4>
              {narrative ? renderNarrative(narrative) : <p className="text-xs text-[var(--prom-muted)]">—</p>}
            </div>
          </div>
        ) : (
          <p className="text-xs text-[var(--prom-muted)]">Genera una bozza per vedere anteprima e checklist.</p>
        )}
        {previewHtml ? (
          <div className="mt-4 space-y-2">
            <h4 className="text-xs font-semibold uppercase text-[var(--prom-muted)]">Anteprima HTML</h4>
            <iframe title="Anteprima bozza contratto" className="h-[420px] w-full rounded-lg border border-[var(--prom-line)] bg-white" srcDoc={previewHtml} />
          </div>
        ) : null}
      </GlassCard>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
