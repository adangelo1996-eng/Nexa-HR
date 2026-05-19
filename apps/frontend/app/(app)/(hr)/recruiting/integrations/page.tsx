"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, Loader2, Plug, Webhook } from "lucide-react";
import { NexaPageHelpButton } from "@/components/nexa-page-help-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getToken } from "@/lib/auth-session";
import {
  fetchLinkedInIntegrationConfig,
  fetchRecruitPositions,
  testLinkedInCandidateIngest,
  type LinkedInIntegrationConfigDto,
  type RecruitPositionDto
} from "@/lib/api";

function getApiBaseForDisplay(): string {
  const env = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const origin = env && env.length > 0 ? env : "http://localhost:4000";
  const withoutTrailing = origin.replace(/\/+$/, "");
  return withoutTrailing.endsWith("/api") ? withoutTrailing : `${withoutTrailing}/api`;
}

export default function RecruitingIntegrationsPage(): React.JSX.Element {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [config, setConfig] = useState<LinkedInIntegrationConfigDto | null>(null);
  const [positions, setPositions] = useState<RecruitPositionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const [jobId, setJobId] = useState("");
  const [firstName, setFirstName] = useState("Mario");
  const [lastName, setLastName] = useState("Rossi");
  const [email, setEmail] = useState("mario.rossi@example.com");

  const publicApiBase = useMemo(() => getApiBaseForDisplay(), []);

  const load = useCallback(
    async (t: string) => {
      setLoading(true);
      setError(null);
      try {
        const [cfg, pos] = await Promise.all([
          fetchLinkedInIntegrationConfig(t, publicApiBase),
          fetchRecruitPositions(t)
        ]);
        setConfig(cfg);
        const open = pos.filter((p) => p.status === "open");
        setPositions(open);
        setJobId((prev) => prev || (open[0]?.id ?? ""));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Errore caricamento");
      } finally {
        setLoading(false);
      }
    },
    [publicApiBase]
  );

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setToken(t);
    void load(t);
  }, [router, load]);

  async function copyWebhookUrl(): Promise<void> {
    if (!config?.webhookUrl) return;
    try {
      await navigator.clipboard.writeText(config.webhookUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Impossibile copiare negli appunti");
    }
  }

  async function onTestIngest(): Promise<void> {
    if (!token || !jobId.trim()) return;
    setTestBusy(true);
    setTestResult(null);
    setError(null);
    try {
      const res = await testLinkedInCandidateIngest(token, {
        jobId: jobId.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || undefined
      });
      const cid = res.result?.candidateId;
      setTestResult(
        cid
          ? `Candidato creato o agganciato (id: ${String(cid)}). Controlla la pipeline della posizione.`
          : "Test completato."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test ingest fallito");
    } finally {
      setTestBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-synapse-text dark:text-white">Integrazioni recruiting</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-synapse-muted dark:text-[#b4c9dc]">
            Collega LinkedIn a Nexa tramite webhook (Zapier o Make). Le candidature diventano candidati nella pipeline
            della posizione indicata.
          </p>
        </div>
        <NexaPageHelpButton pageKey="recruiting-integrations" />
      </header>

      {loading && (
        <p className="flex items-center gap-2 text-sm text-synapse-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Caricamento…
        </p>
      )}
      {error && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-200">
          {error}
        </p>
      )}

      {config && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Webhook className="h-5 w-5" />
                Webhook LinkedIn → Nexa
              </CardTitle>
              <CardDescription>
                Imposta <code className="text-xs">LINKEDIN_WEBHOOK_SECRET</code> sul backend Render, poi usa questo URL
                nel tuo Zap.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2 text-sm">
                <span
                  className={`rounded-full px-2 py-0.5 ${config.webhookSecretSet ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-800 dark:text-amber-200"}`}
                >
                  Secret {config.webhookSecretSet ? "configurato" : "mancante"}
                </span>
                <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-synapse-muted">
                  API LinkedIn: {config.adapterMode === "oauth" ? "OAuth" : "stub (senza partner)"}
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-synapse-muted">URL webhook (POST)</label>
                <div className="flex gap-2">
                  <Input readOnly value={config.webhookUrl} className="font-mono text-xs" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => void copyWebhookUrl()}
                    aria-label="Copia URL"
                  >
                    {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-1 text-sm text-synapse-muted">
                <p>
                  <span className="font-medium text-synapse-text dark:text-white">companyId</span>:{" "}
                  <code className="text-xs">{config.companyId}</code>
                </p>
                <p>
                  Header firma: {config.signatureHeaders.join(", ")} — {config.signatureFormat}
                </p>
                <p>Limite: {config.rateLimitPerMinute} richieste al minuto per IP.</p>
                <p className="text-xs">
                  Documentazione: <code>{config.documentationPath}</code> nel repository Nexa-HR.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Plug className="h-5 w-5" />
                Test ingest (senza Zapier)
              </CardTitle>
              <CardDescription>
                Simula una candidatura sulla posizione selezionata. Richiede permesso recruiting in scrittura.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-synapse-muted">Posizione Nexa (jobId)</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value)}
                >
                  <option value="">— Seleziona —</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} ({p.job_code || p.id.slice(0, 8)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input placeholder="Nome" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                <Input placeholder="Cognome" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
              <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Button type="button" disabled={testBusy || !jobId} onClick={() => void onTestIngest()}>
                {testBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Esegui test ingest
              </Button>
              {testResult && <p className="text-sm text-emerald-700 dark:text-emerald-300">{testResult}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Zapier — passi rapidi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-synapse-muted">
              <ol className="list-decimal space-y-2 pl-5">
                <li>Trigger LinkedIn (o export/email) nel tuo piano Zapier.</li>
                <li>Action Webhooks POST verso l&apos;URL sopra, body JSON con jobId, nome, email, linkedinUrl.</li>
                <li>Code step: HMAC-SHA256 del body con il secret, header X-Nexa-Signature.</li>
                <li>Verifica con il test qui sopra, poi attiva lo Zap in produzione.</li>
              </ol>
              <p>
                Fallback:{" "}
                <Link href="/recruiting/candidates" className="text-primary underline">
                  import manuale candidati
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
