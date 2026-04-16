"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchAiNlQueryCatalog,
  postAiAnomalies,
  postAiAssistant,
  postAiNlQueryRun,
  postAiNlQuerySaveView,
  postAiTriage,
  type AiNlCatalogEntryDto
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";

export default function AiHubPage(): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [assistantMsg, setAssistantMsg] = useState("");
  const [assistantReply, setAssistantReply] = useState<string | null>(null);
  const [assistantBusy, setAssistantBusy] = useState(false);

  const [catalog, setCatalog] = useState<AiNlCatalogEntryDto[]>([]);
  const [selectedQueryId, setSelectedQueryId] = useState<string>("");
  const [nlSummary, setNlSummary] = useState<string | null>(null);
  const [nlRows, setNlRows] = useState<Record<string, unknown>[]>([]);
  const [nlBusy, setNlBusy] = useState(false);
  const [viewLabel, setViewLabel] = useState("");

  const [anomalyOut, setAnomalyOut] = useState<string | null>(null);
  const [anomalyBusy, setAnomalyBusy] = useState(false);

  const [triageText, setTriageText] = useState("");
  const [triageOut, setTriageOut] = useState<string | null>(null);
  const [triageBusy, setTriageBusy] = useState(false);

  const bootstrap = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setToken(t);
    setError(null);
    try {
      const q = await fetchAiNlQueryCatalog(t);
      setCatalog(q);
      if (q[0]) setSelectedQueryId(q[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore catalogo NL");
    }
  }, [router]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const runAssistant = async (): Promise<void> => {
    const t = token ?? getToken();
    if (!t || !assistantMsg.trim()) return;
    setAssistantBusy(true);
    setError(null);
    try {
      const r = await postAiAssistant(t, { message: assistantMsg.trim(), page: pathname ?? undefined });
      setAssistantReply(r.reply);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assistente non disponibile");
    } finally {
      setAssistantBusy(false);
    }
  };

  const runNl = async (): Promise<void> => {
    const t = token ?? getToken();
    if (!t || !selectedQueryId) return;
    setNlBusy(true);
    setError(null);
    try {
      const r = await postAiNlQueryRun(t, { queryId: selectedQueryId });
      setNlSummary(r.summary);
      setNlRows(r.table);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Query non eseguita");
    } finally {
      setNlBusy(false);
    }
  };

  const saveView = async (): Promise<void> => {
    const t = token ?? getToken();
    if (!t || !selectedQueryId || !viewLabel.trim()) return;
    setNlBusy(true);
    setError(null);
    try {
      await postAiNlQuerySaveView(t, { label: viewLabel.trim(), queryId: selectedQueryId });
      setViewLabel("");
      setNlSummary((s) => (s ? `${s}\nVista registrata (log audit).` : "Vista registrata (log audit)."));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Salvataggio non consentito");
    } finally {
      setNlBusy(false);
    }
  };

  const runAnomalies = async (): Promise<void> => {
    const t = token ?? getToken();
    if (!t) return;
    setAnomalyBusy(true);
    setError(null);
    try {
      const r = await postAiAnomalies(t);
      setAnomalyOut(`${r.explanation}\n\n${r.items.map((i) => `• [${i.code}] ${i.message}`).join("\n")}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Anomalie non disponibili");
    } finally {
      setAnomalyBusy(false);
    }
  };

  const runTriage = async (): Promise<void> => {
    const t = token ?? getToken();
    if (!t || !triageText.trim()) return;
    setTriageBusy(true);
    setError(null);
    try {
      const r = await postAiTriage(t, { text: triageText.trim() });
      setTriageOut(
        `Categoria: ${r.category}\nPriorità: ${r.priority}\n${r.rationale}` +
          (r.suggestedPath ? `\nPercorso suggerito: ${r.suggestedPath}` : "")
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Triage non disponibile");
    } finally {
      setTriageBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Centro AI HR</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Funzioni Fase 1: assistente, ricerca guidata (query catalogate), anomalie, triage. Richiedono i permessi Nexa dedicati.
        </p>
      </div>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Assistente</CardTitle>
          <CardDescription>Risposte su ferie e policy; i dati sensibili passano dal gateway di pseudonimizzazione lato server.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Textarea value={assistantMsg} onChange={(e) => setAssistantMsg(e.target.value)} rows={4} placeholder="Chiedi ad esempio del saldo ferie…" />
          <Button type="button" disabled={assistantBusy} onClick={() => void runAssistant()}>
            {assistantBusy ? "Elaborazione…" : "Invia"}
          </Button>
          {assistantReply ? <pre className="bg-muted rounded-md p-3 text-sm whitespace-pre-wrap">{assistantReply}</pre> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ricerca NL (catalogo)</CardTitle>
          <CardDescription>Solo interrogazioni pre-approvate dal server; nessun SQL generato dal modello.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <select
            className="border-input bg-background ring-offset-background focus-visible:ring-ring rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            value={selectedQueryId}
            onChange={(e) => setSelectedQueryId(e.target.value)}
          >
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <Button type="button" variant="secondary" disabled={nlBusy} onClick={() => void runNl()}>
            {nlBusy ? "Esecuzione…" : "Esegui query"}
          </Button>
          {nlSummary ? <p className="text-sm font-medium">{nlSummary}</p> : null}
          {nlRows.length > 0 ? (
            <pre className="bg-muted max-h-64 overflow-auto rounded-md p-3 text-xs">{JSON.stringify(nlRows, null, 2)}</pre>
          ) : null}
          <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label className="text-muted-foreground mb-1 block text-xs">Salva vista (richiede permesso write)</label>
              <Input value={viewLabel} onChange={(e) => setViewLabel(e.target.value)} placeholder="Nome vista" />
            </div>
            <Button type="button" variant="outline" disabled={nlBusy || !viewLabel.trim()} onClick={() => void saveView()}>
              Registra vista
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Anomalie</CardTitle>
          <CardDescription>Regole deterministiche su ferie e cedolini; sintesi attraverso lo stesso gateway privacy.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button type="button" disabled={anomalyBusy} onClick={() => void runAnomalies()}>
            {anomalyBusy ? "Analisi…" : "Esegui controllo"}
          </Button>
          {anomalyOut ? <pre className="bg-muted rounded-md p-3 text-sm whitespace-pre-wrap">{anomalyOut}</pre> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Triage richiesta</CardTitle>
          <CardDescription>Classificazione rule-based dopo attraversamento del gateway sul testo in ingresso/uscita.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Textarea value={triageText} onChange={(e) => setTriageText(e.target.value)} rows={5} placeholder="Descrivi la richiesta HR…" />
          <Button type="button" disabled={triageBusy} onClick={() => void runTriage()}>
            {triageBusy ? "Classificazione…" : "Classifica"}
          </Button>
          {triageOut ? <pre className="bg-muted rounded-md p-3 text-sm whitespace-pre-wrap">{triageOut}</pre> : null}
        </CardContent>
      </Card>
    </div>
  );
}
