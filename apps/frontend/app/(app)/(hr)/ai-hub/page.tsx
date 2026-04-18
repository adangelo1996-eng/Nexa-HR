"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  ChevronRight,
  Compass,
  Lock,
  MessageCircle,
  Shield,
  Sparkles,
  Table2,
  Tags,
  Wand2
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchAiAssistantOrgUsers,
  fetchAiAssistantScopeOptions,
  fetchAiNlQueryCatalog,
  fetchCurrentUser,
  postAiAnomalies,
  postAiAssistant,
  postAiNlQueryRun,
  postAiNlQuerySaveView,
  postAiTriage,
  type AiAssistantScopeMode,
  type AiAssistantScopeOptionsDto,
  type AiAssistantScopePayload,
  type AiNlCatalogEntryDto
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { HebbAiExperienceShell } from "@/components/hebb-ai-experience-shell";
import { HebbAiPageHelpButton } from "@/components/hebb-ai-page-help-button";

const ASSISTANT_SUGGESTIONS = [
  { label: "Ferie", text: "Quanto mi resta di ferie quest’anno?" },
  { label: "Permessi", text: "Cosa posso chiederti su ferie e permessi?" },
  { label: "Documenti", text: "Dove trovo le regole aziendali sui permessi?" }
];

const NL_COLUMN_LABELS: Record<string, string> = {
  year: "Anno",
  allocatedDays: "Giorni assegnati",
  usedDays: "Giorni usati",
  residualDays: "Giorni rimasti",
  id: "Codice",
  startDate: "Dal",
  endDate: "Al",
  status: "Stato",
  kind: "Tipo",
  period: "Periodo",
  grossSalary: "Lordo",
  netSalary: "Netto",
  userId: "Riferimento"
};

type ChatTurn = { role: "user" | "assistant"; text: string };

function friendlyError(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  if (/403|Permessi insufficienti|Forbidden/i.test(m)) {
    return "Non hai i permessi per questa azione. Chiedi a HR o all’amministratore se ti serve l’accesso.";
  }
  if (/401|Token|autenticazione/i.test(m)) {
    return "Sessione scaduta: effettua di nuovo l’accesso.";
  }
  return m || "Qualcosa non è andato a buon fine. Riprova tra poco.";
}

function formatNlValue(key: string, v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  if (/salary|Salary|gross|net/i.test(key) && typeof v === "number") {
    return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(v);
  }
  if (/salary|Salary|gross|net/i.test(key)) {
    const n = Number(s.replace(",", "."));
    if (!Number.isNaN(n)) {
      return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);
    }
  }
  if (/date|Date|period/i.test(key) && /^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
    }
  }
  return s;
}

function NlRowsCards({ rows }: { rows: Record<string, unknown>[] }): React.JSX.Element | null {
  if (!rows.length) return null;
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {rows.map((row, i) => (
        <div
          key={i}
          className="rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_94%,transparent)] p-4 shadow-sm"
        >
          <ul className="space-y-2 text-sm text-[var(--prom-text)]">
            {Object.entries(row).map(([k, v]) => (
              <li key={k} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                <span className="text-xs font-medium text-[var(--prom-muted)]">{NL_COLUMN_LABELS[k] ?? k}</span>
                <span className="font-medium break-all sm:text-right">{formatNlValue(k, v)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function formatTriageForHumans(
  category: string,
  priority: string,
  rationale: string,
  suggestedPath: string | null
): string {
  const cat: Record<string, string> = {
    urgent: "Richiesta urgente",
    leave: "Ferie o permessi",
    payroll: "Stipendio o cedolini",
    sickness: "Malattia o certificati",
    general: "Richiesta generale"
  };
  const pri: Record<string, string> = {
    high: "Priorità alta",
    normal: "Priorità normale",
    low: "Priorità bassa"
  };
  const lines = [
    `Tipo: ${cat[category] ?? category}`,
    `Urgenza: ${pri[priority] ?? priority}`,
    "",
    rationale
  ];
  if (suggestedPath) {
    lines.push("", `Ti suggeriamo di aprire la sezione collegata nell’app (percorso: ${suggestedPath}).`);
  }
  return lines.join("\n");
}

function formatAnomaliesForHumans(explanation: string, items: { code: string; message: string }[]): string {
  if (!items.length) {
    return explanation || "Tutto in ordine: non abbiamo trovato segnali da segnalarti.";
  }
  const head = explanation ? `${explanation}\n\n` : "";
  const body = items.map((x) => `• ${x.message}`).join("\n");
  return head + body;
}

function scrollToId(id: string): void {
  const el = document.getElementById(id);
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };

const SCOPE_MODE_LABEL: Record<AiAssistantScopeMode, string> = {
  self: "Solo il mio profilo",
  user: "Una persona",
  team: "Un team",
  cost_center: "Un centro di costo"
};

function effectiveScopeModes(options: AiAssistantScopeOptionsDto | null): AiAssistantScopeMode[] {
  if (!options?.modesAllowed?.length) {
    return ["self"];
  }
  const hasOrg = options.modesAllowed.includes("cost_center");
  let list = [...options.modesAllowed];
  if (!hasOrg) {
    const mu = options.managedUsers ?? [];
    if (!mu.length) {
      list = list.filter((m) => m !== "user");
    }
  }
  if (!(options.teams?.length ?? 0)) {
    list = list.filter((m) => m !== "team");
  }
  if (!(options.costCenters?.length ?? 0)) {
    list = list.filter((m) => m !== "cost_center");
  }
  return list.length ? list : ["self"];
}

export default function AiHubPage(): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const pathname = usePathname();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [llmActive, setLlmActive] = useState(false);

  const [assistantMsg, setAssistantMsg] = useState("");
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [thread, setThread] = useState<ChatTurn[]>([]);
  const [assistantLastRun, setAssistantLastRun] = useState<{
    llm: { configured: boolean; refineApplied: boolean };
    privacy: { pseudonymizedTokenCount: number; schemaVersion: string };
    sources: string[];
  } | null>(null);

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

  const [scopeOptions, setScopeOptions] = useState<AiAssistantScopeOptionsDto | null>(null);
  const [scopeMode, setScopeMode] = useState<AiAssistantScopeMode>("self");
  const [scopeUserId, setScopeUserId] = useState("");
  const [scopeTeamId, setScopeTeamId] = useState("");
  const [scopeCostCenterId, setScopeCostCenterId] = useState("");
  const [orgUserQuery, setOrgUserQuery] = useState("");
  const [orgUserResults, setOrgUserResults] = useState<{ userId: string; label: string }[]>([]);
  const [orgUserSearchBusy, setOrgUserSearchBusy] = useState(false);

  const allowedScopeModes = useMemo(() => effectiveScopeModes(scopeOptions), [scopeOptions]);
  const isOrgAiScope = Boolean(scopeOptions?.modesAllowed.includes("cost_center"));

  const selectedCatalogEntry = useMemo(
    () => catalog.find((c) => c.id === selectedQueryId),
    [catalog, selectedQueryId]
  );

  const motionProps = reduceMotion ? {} : { initial: "hidden", whileInView: "show", viewport: { once: true, margin: "-40px" } };

  const bootstrap = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setToken(t);
    setError(null);
    try {
      const me = await fetchCurrentUser(t);
      if (me.nexaAiOpenAiEnabled !== true) {
        router.replace("/");
        return;
      }
      const pack = await fetchAiNlQueryCatalog(t);
      setCatalog(pack.queries);
      setLlmActive(pack.capabilities.llmActive);
      if (pack.queries[0]) setSelectedQueryId(pack.queries[0].id);
      try {
        const scope = await fetchAiAssistantScopeOptions(t);
        setScopeOptions(scope);
      } catch {
        setScopeOptions({ modesAllowed: ["self"] });
      }
      setScopeMode("self");
      setScopeUserId("");
      setScopeTeamId("");
      setScopeCostCenterId("");
      setOrgUserQuery("");
      setOrgUserResults([]);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [router]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!allowedScopeModes.includes(scopeMode)) {
      setScopeMode(allowedScopeModes[0] ?? "self");
    }
  }, [allowedScopeModes, scopeMode]);

  useEffect(() => {
    if (scopeMode === "team" && scopeOptions?.teams?.length) {
      setScopeTeamId((prev) =>
        prev && scopeOptions.teams!.some((x) => x.teamId === prev) ? prev : scopeOptions.teams![0]!.teamId
      );
    }
    if (scopeMode === "cost_center" && scopeOptions?.costCenters?.length) {
      setScopeCostCenterId((prev) =>
        prev && scopeOptions.costCenters!.some((x) => x.costCenterId === prev)
          ? prev
          : scopeOptions.costCenters![0]!.costCenterId
      );
    }
    if (scopeMode === "user" && !isOrgAiScope && scopeOptions?.managedUsers?.length) {
      setScopeUserId((prev) =>
        prev && scopeOptions.managedUsers!.some((x) => x.userId === prev)
          ? prev
          : scopeOptions.managedUsers![0]!.userId
      );
    }
  }, [scopeMode, scopeOptions, isOrgAiScope]);

  const orgSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const t = token ?? getToken();
    if (!t || scopeMode !== "user" || !isOrgAiScope) {
      setOrgUserResults([]);
      setOrgUserSearchBusy(false);
      return;
    }
    const q = orgUserQuery.trim();
    if (q.length < 2) {
      setOrgUserResults([]);
      setOrgUserSearchBusy(false);
      return;
    }
    if (orgSearchTimer.current) {
      clearTimeout(orgSearchTimer.current);
    }
    setOrgUserSearchBusy(true);
    orgSearchTimer.current = setTimeout(() => {
      void fetchAiAssistantOrgUsers(t, q)
        .then((r) => setOrgUserResults(r.users))
        .catch(() => setOrgUserResults([]))
        .finally(() => setOrgUserSearchBusy(false));
    }, 350);
    return () => {
      if (orgSearchTimer.current) {
        clearTimeout(orgSearchTimer.current);
      }
    };
  }, [orgUserQuery, scopeMode, isOrgAiScope, token]);

  const runAssistant = async (): Promise<void> => {
    const t = token ?? getToken();
    if (!t || !assistantMsg.trim()) return;
    const userText = assistantMsg.trim();
    let scope: AiAssistantScopePayload | undefined;
    if (scopeMode !== "self" && allowedScopeModes.includes(scopeMode)) {
      if (scopeMode === "user") {
        const uid = scopeUserId.trim();
        if (!uid) {
          setError("Per l’ambito «Una persona» seleziona un dipendente dai menu (non scrivere il nome nel messaggio).");
          return;
        }
        scope = { mode: "user", userId: uid };
      } else if (scopeMode === "team") {
        const tid = scopeTeamId.trim();
        if (!tid) {
          setError("Seleziona un team per continuare.");
          return;
        }
        scope = { mode: "team", teamId: tid };
      } else if (scopeMode === "cost_center") {
        const cc = scopeCostCenterId.trim();
        if (!cc) {
          setError("Seleziona un centro di costo per continuare.");
          return;
        }
        scope = { mode: "cost_center", costCenterId: cc };
      }
    }
    setAssistantBusy(true);
    setError(null);
    setThread((prev) => [...prev, { role: "user", text: userText }]);
    setAssistantMsg("");
    try {
      const r = await postAiAssistant(t, {
        message: userText,
        page: pathname ?? undefined,
        ...(scope ? { scope } : {})
      });
      setAssistantLastRun({ llm: r.llm, privacy: r.privacy, sources: r.sources });
      setThread((prev) => [...prev, { role: "assistant", text: r.reply }]);
    } catch (e) {
      setError(friendlyError(e));
      setThread((prev) => prev.slice(0, -1));
      setAssistantMsg(userText);
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
      setError(friendlyError(e));
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
      setNlSummary((s) =>
        s
          ? `${s}\n\nHai salvato questa vista: la richiesta è stata registrata in modo sicuro.`
          : "Vista salvata: la richiesta è stata registrata in modo sicuro."
      );
    } catch (e) {
      setError(friendlyError(e));
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
      setAnomalyOut(formatAnomaliesForHumans(r.explanation, r.items));
    } catch (e) {
      setError(friendlyError(e));
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
      setTriageOut(formatTriageForHumans(r.category, r.priority, r.rationale, r.suggestedPath ?? null));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setTriageBusy(false);
    }
  };

  const hubEyebrow = (
    <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--prom-surface)_78%,transparent)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--prom-muted)] shadow-sm backdrop-blur-md">
      <Activity className="h-3.5 w-3.5 text-[var(--prom-gold)]" aria-hidden />
      Il cuore intelligente di <span className="nexa-wordmark-face text-[var(--prom-text)]">NEXA</span> HR
    </p>
  );

  return (
    <HebbAiExperienceShell
      eyebrow={hubEyebrow}
      title="Centro AI HR"
      subtitle={
        <>
          Qui trovi una guida gentile su ferie, numeri che ti riguardano e piccoli controlli utili — spiegati come in
          una conversazione, non come un manuale tecnico.
        </>
      }
      headerTrailing={<HebbAiPageHelpButton pageKey="ai-hub" />}
    >
        <motion.nav
          className="mx-auto mt-10 flex max-w-3xl flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center"
          {...motionProps}
          variants={fadeUp}
          transition={{ duration: 0.35 }}
        >
          <p className="sr-only">Percorso consigliato in tre passi</p>
          {[
            { id: "assistente", step: "1", title: "Chiedi", sub: "In parole tue" },
            { id: "numeri", step: "2", title: "I tuoi numeri", sub: "In sicurezza" },
            { id: "controlli", step: "3", title: "Controlli e capire", sub: "Anomalie e richieste" }
          ].map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => scrollToId(s.id)}
              className="group flex flex-1 items-center gap-3 rounded-2xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--prom-surface)_80%,transparent)] px-4 py-3 text-left shadow-[var(--glass-shadow)] backdrop-blur-md transition hover:border-[color-mix(in_srgb,var(--prom-gold)_55%,var(--prom-line))] sm:min-w-[160px]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#002D72] to-[#1a4d8c] text-sm font-bold text-white">
                {s.step}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-sm font-semibold text-[var(--prom-text)]">
                  {s.title}
                  <ChevronRight className="h-4 w-4 opacity-0 transition group-hover:opacity-100" aria-hidden />
                </span>
                <span className="block text-xs text-[var(--prom-muted)]">{s.sub}</span>
              </span>
            </button>
          ))}
        </motion.nav>

        <div className="mx-auto mt-10 grid max-w-3xl gap-4 md:grid-cols-2">
          <div
            className="flex gap-3 rounded-2xl border border-[var(--glass-border)] p-4 shadow-[var(--glass-shadow)] backdrop-blur-md"
            style={{ background: "var(--glass-bg)" }}
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--prom-gold)_18%,transparent)] text-[var(--prom-gold-soft)]">
              <Lock className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--prom-text)]">I tuoi dati restano al sicuro</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--prom-muted)]">
                Prima di elaborare qualcosa con l’intelligenza artificiale, i dati sensibili vengono resi anonimi: così
                non circolano in chiaro.
              </p>
            </div>
          </div>
          <div
            className="flex gap-3 rounded-2xl border border-[var(--glass-border)] p-4 shadow-[var(--glass-shadow)] backdrop-blur-md"
            style={{ background: "var(--glass-bg)" }}
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--prom-gold)_18%,transparent)] text-[var(--prom-gold-soft)]">
              <Wand2 className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--prom-text)]">
                {llmActive ? "Risposte arricchite dall’AI attive" : "Risposte guidate, sempre chiare"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--prom-muted)]">
                {llmActive
                  ? "È attivo un modello linguistico che rende le risposte più naturali, sempre dopo l’anonimizzazione."
                  : "Oggi le risposte sono preparate in modo stabile e comprensibile; l’azienda può attivare il modello linguistico quando è pronta."}
              </p>
            </div>
          </div>
        </div>

        <details className="mx-auto mt-8 max-w-3xl rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] px-4 py-3 text-sm text-[var(--prom-muted)]">
          <summary className="cursor-pointer list-none font-semibold text-[var(--prom-text)] [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              <Compass className="h-4 w-4 text-[var(--prom-gold)]" aria-hidden />
              Cos’è ogni cosa qui? (tocca per aprire)
            </span>
          </summary>
          <ul className="mt-3 space-y-2 pl-1 text-xs leading-relaxed md:text-sm">
            <li>
              <strong className="text-[var(--prom-text)]">Chiedi</strong> — una conversazione: ferie, documenti, cosa
              fare nell’app.
            </li>
            <li>
              <strong className="text-[var(--prom-text)]">I tuoi numeri</strong> — solo domande già approvate
              dall’azienda, così vedi solo ciò che ti spetta.
            </li>
            <li>
              <strong className="text-[var(--prom-text)]">Controlli</strong> — un colpo d’occhio su ferie e cedolini,
              senza allarmismi.
            </li>
            <li>
              <strong className="text-[var(--prom-text)]">Capire una richiesta</strong> — incolli un messaggio e ti
              diciamo che tipo di tema è e dove andare.
            </li>
          </ul>
        </details>

        {error ? (
          <p
            className="mx-auto mt-8 max-w-2xl rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-800 dark:text-rose-100"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <motion.section
          id="assistente"
          className="mt-14 scroll-mt-24 rounded-3xl border border-[var(--glass-border)] p-6 shadow-[var(--card-shadow)] md:p-8"
          style={{ background: "var(--card-bg)" }}
          {...motionProps}
          variants={fadeUp}
          transition={{ duration: 0.4 }}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#002D72] to-[#1a4d8c] text-white shadow-lg">
                <MessageCircle className="h-7 w-7" aria-hidden />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-[var(--prom-text)]">Chiedi in parole tue</h2>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-[var(--prom-muted)]">
                  Scrivi come a una persona di HR. Se non sai da dove iniziare, scegli un suggerimento qui sotto.
                </p>
              </div>
            </div>
            <Sparkles className="hidden h-8 w-8 shrink-0 text-[var(--prom-gold)] opacity-80 md:block" aria-hidden />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {ASSISTANT_SUGGESTIONS.map((s) => (
              <button
                key={s.text}
                type="button"
                className="rounded-full border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_90%,transparent)] px-3 py-2 text-left text-xs font-medium text-[var(--prom-text)] transition hover:border-[var(--prom-gold)] hover:bg-[color-mix(in_srgb,var(--prom-gold)_12%,transparent)]"
                onClick={() => {
                  setAssistantMsg(s.text);
                }}
              >
                <span className="mr-1.5 rounded-md bg-[color-mix(in_srgb,var(--prom-gold)_20%,transparent)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--prom-text)]">
                  {s.label}
                </span>
                {s.text}
              </button>
            ))}
          </div>
          {scopeOptions && allowedScopeModes.length > 1 ? (
            <div className="mt-5 space-y-3 rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] p-4">
              <div>
                <p className="text-xs font-semibold text-[var(--prom-text)]">Su quali dati vuoi orientarti?</p>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--prom-muted)]">
                  Scegli l’ambito qui: non inserire nominativi nel messaggio — il sistema applica i permessi e anonimizza i
                  dati sensibili prima dell’eventuale modello AI.
                </p>
              </div>
              <label className="block text-[11px] font-medium text-[var(--prom-muted)]" htmlFor="ai-hub-scope-mode">
                Ambito
              </label>
              <select
                id="ai-hub-scope-mode"
                className="h-11 w-full max-w-md rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_94%,transparent)] px-3 text-sm text-[var(--prom-text)] focus-visible:ring-2 focus-visible:ring-[var(--prom-gold)] focus-visible:outline-none"
                value={scopeMode}
                onChange={(e) => {
                  const v = e.target.value as AiAssistantScopeMode;
                  setScopeMode(v);
                  if (v !== "user") {
                    setOrgUserQuery("");
                    setOrgUserResults([]);
                    setScopeUserId("");
                  }
                }}
              >
                {allowedScopeModes.map((m) => (
                  <option key={m} value={m}>
                    {SCOPE_MODE_LABEL[m]}
                  </option>
                ))}
              </select>
              {scopeMode === "user" && isOrgAiScope ? (
                <div className="space-y-2">
                  <label className="block text-[11px] font-medium text-[var(--prom-muted)]" htmlFor="ai-hub-org-user-q">
                    Cerca dipendente (minimo 2 caratteri)
                  </label>
                  <Input
                    id="ai-hub-org-user-q"
                    value={orgUserQuery}
                    onChange={(e) => {
                      setOrgUserQuery(e.target.value);
                      setScopeUserId("");
                    }}
                    placeholder="Nome o email…"
                    className="rounded-xl border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_96%,transparent)]"
                  />
                  {orgUserSearchBusy ? (
                    <p className="text-[11px] text-[var(--prom-muted)]">Ricerca in corso…</p>
                  ) : null}
                  {orgUserResults.length > 0 ? (
                    <ul
                      className="max-h-36 overflow-y-auto rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_96%,transparent)] text-sm"
                      role="listbox"
                    >
                      {orgUserResults.map((u) => (
                        <li key={u.userId} className="border-b border-[var(--prom-line)] last:border-0">
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-[var(--prom-text)] transition hover:bg-[color-mix(in_srgb,var(--prom-gold)_10%,transparent)]"
                            onClick={() => {
                              setScopeUserId(u.userId);
                              setOrgUserQuery(u.label);
                              setOrgUserResults([]);
                            }}
                          >
                            {u.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {scopeUserId.trim() ? (
                    <p className="text-[11px] text-[var(--prom-muted)]">
                      Persona selezionata (id interno non visibile al modello in chiaro).
                    </p>
                  ) : null}
                </div>
              ) : null}
              {scopeMode === "user" && !isOrgAiScope && (scopeOptions.managedUsers?.length ?? 0) > 0 ? (
                <div className="space-y-2">
                  <label className="block text-[11px] font-medium text-[var(--prom-muted)]" htmlFor="ai-hub-managed-user">
                    Persona tra i riporti / team
                  </label>
                  <select
                    id="ai-hub-managed-user"
                    className="h-11 w-full max-w-md rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_94%,transparent)] px-3 text-sm text-[var(--prom-text)] focus-visible:ring-2 focus-visible:ring-[var(--prom-gold)] focus-visible:outline-none"
                    value={scopeUserId}
                    onChange={(e) => setScopeUserId(e.target.value)}
                  >
                    {(scopeOptions.managedUsers ?? []).map((u) => (
                      <option key={u.userId} value={u.userId}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {scopeMode === "team" && (scopeOptions.teams?.length ?? 0) > 0 ? (
                <div className="space-y-2">
                  <label className="block text-[11px] font-medium text-[var(--prom-muted)]" htmlFor="ai-hub-team">
                    Team
                  </label>
                  <select
                    id="ai-hub-team"
                    className="h-11 w-full max-w-md rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_94%,transparent)] px-3 text-sm text-[var(--prom-text)] focus-visible:ring-2 focus-visible:ring-[var(--prom-gold)] focus-visible:outline-none"
                    value={scopeTeamId}
                    onChange={(e) => setScopeTeamId(e.target.value)}
                  >
                    {(scopeOptions.teams ?? []).map((t) => (
                      <option key={t.teamId} value={t.teamId}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {scopeMode === "cost_center" && (scopeOptions.costCenters?.length ?? 0) > 0 ? (
                <div className="space-y-2">
                  <label className="block text-[11px] font-medium text-[var(--prom-muted)]" htmlFor="ai-hub-cc">
                    Centro di costo
                  </label>
                  <select
                    id="ai-hub-cc"
                    className="h-11 w-full max-w-md rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_94%,transparent)] px-3 text-sm text-[var(--prom-text)] focus-visible:ring-2 focus-visible:ring-[var(--prom-gold)] focus-visible:outline-none"
                    value={scopeCostCenterId}
                    onChange={(e) => setScopeCostCenterId(e.target.value)}
                  >
                    {(scopeOptions.costCenters ?? []).map((c) => (
                      <option key={c.costCenterId} value={c.costCenterId}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          ) : scopeOptions && allowedScopeModes.length === 1 ? (
            <p className="mt-4 text-center text-[11px] leading-relaxed text-[var(--prom-muted)]">
              L’ambito assistente è limitato al tuo profilo. Per analizzare altre persone servono permessi HR, admin o
              responsabile di team.
            </p>
          ) : null}
          <div className="mt-6 flex max-h-[min(420px,52vh)] flex-col gap-4 overflow-hidden rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)]">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {thread.length === 0 ? (
                <p className="text-center text-sm text-[var(--prom-muted)]">
                  Ancora nessun messaggio: scrivi qui sotto e iniziamo.
                </p>
              ) : (
                thread.map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={
                        m.role === "user"
                          ? "max-w-[92%] rounded-2xl rounded-br-md bg-gradient-to-br from-[#002D72] to-[#1a4d8c] px-4 py-3 text-sm leading-relaxed text-white shadow-md"
                          : "max-w-[92%] rounded-2xl rounded-bl-md border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_96%,transparent)] px-4 py-3 text-sm leading-relaxed text-[var(--prom-text)] shadow-sm"
                      }
                    >
                      <p className="whitespace-pre-wrap">{m.text}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_94%,transparent)] p-4">
              <Textarea
                value={assistantMsg}
                onChange={(e) => setAssistantMsg(e.target.value)}
                rows={3}
                placeholder="Es.: quanti giorni di ferie mi restano dopo l’ultima richiesta?"
                className="min-h-[88px] resize-y rounded-xl border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_96%,transparent)] text-[var(--prom-text)] placeholder:text-[var(--prom-muted)]"
              />
              <Button
                type="button"
                className="mt-3 h-11 w-full rounded-xl text-base font-semibold sm:w-auto sm:min-w-[180px]"
                disabled={assistantBusy || !assistantMsg.trim()}
                onClick={() => void runAssistant()}
              >
                {assistantBusy ? "Sto pensando…" : "Invia"}
                {!assistantBusy ? <ArrowRight className="ml-2 inline h-4 w-4 align-text-bottom" aria-hidden /> : null}
              </Button>
              {assistantLastRun ? (
                <details className="mt-4 rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] px-3 py-2 text-[11px] text-[var(--prom-muted)]">
                  <summary className="cursor-pointer font-medium text-[var(--prom-text)]">
                    Ultima risposta: modello AI o bozza? Cosa è stato inviato
                  </summary>
                  <ul className="mt-2 list-inside list-disc space-y-1.5 leading-relaxed">
                    <li>
                      <strong className="text-[var(--prom-text)]">Stato globale</strong> (da catalogo NL in alto):{" "}
                      {llmActive
                        ? "OpenAI abilitata in configurazione (chiave + NEXA_AI_OPENAI_ENABLED=true)."
                        : "OpenAI non abilitata: le risposte usano solo la bozza locale."}
                    </li>
                    <li>
                      <strong className="text-[var(--prom-text)]">Questa richiesta</strong>: il modello ha riscritto il
                      testo dopo la pseudonimizzazione?{" "}
                      <strong className="text-[var(--prom-text)]">
                        {assistantLastRun.llm.refineApplied ? "Sì." : "No (bozza / errore modello / JSON non valido)."}
                      </strong>{" "}
                      {assistantLastRun.llm.configured
                        ? "Il backend era configurato per chiamare OpenAI."
                        : "Il backend non era configurato per chiamare OpenAI."}
                    </li>
                    <li>
                      Nel JSON inviato al modello (se chiamato) compaiono token di anonimizzazione:{" "}
                      <strong className="text-[var(--prom-text)]">{assistantLastRun.privacy.pseudonymizedTokenCount}</strong>{" "}
                      (conteggio vault). Schema:{" "}
                      <code className="rounded bg-[color-mix(in_srgb,var(--prom-line)_40%,transparent)] px-1">
                        {assistantLastRun.privacy.schemaVersion || "—"}
                      </code>
                      .
                    </li>
                    <li>
                      <strong className="text-[var(--prom-text)]">Fonti dati</strong> usate per costruire i fatti:{" "}
                      {assistantLastRun.sources.length ? assistantLastRun.sources.join(", ") : "—"}.
                    </li>
                  </ul>
                  <p className="mt-2 border-t border-[var(--prom-line)] pt-2 text-[10px] leading-relaxed opacity-95">
                    Struttura tipica verso il modello: oggetto con <code className="rounded px-0.5">envelope.text</code>{" "}
                    (bozza in italiano) e <code className="rounded px-0.5">envelope.facts</code> (messaggio utente,{" "}
                    <code className="rounded px-0.5">snapshot</code>, percorsi app, eventuale saldo ferie, titoli policy).
                    UUID e campi sensibili previsti dal registry diventano token{" "}
                    <code className="rounded px-0.5">__nexa_ref:…</code>. Il testo libero della domanda resta nel JSON
                    come lo hai scritto: non passare nomi di colleghi nel messaggio.
                  </p>
                </details>
              ) : null}
            </div>
          </div>
        </motion.section>

        <motion.section
          id="numeri"
          className="mt-10 scroll-mt-24 rounded-3xl border border-[var(--glass-border)] p-6 shadow-[var(--card-shadow)] md:p-8"
          style={{ background: "var(--card-bg)" }}
          {...motionProps}
          variants={fadeUp}
          transition={{ duration: 0.4, delay: 0.05 }}
        >
          <div className="flex gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3a5466] to-[#002D72] text-white shadow-lg">
              <Table2 className="h-7 w-7" aria-hidden />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-[var(--prom-text)]">I tuoi numeri, in un attimo</h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--prom-muted)]">
                Scegli cosa vuoi vedere dall’elenco approvato dall’azienda: ti mostriamo solo ciò che ti riguarda, in
                forma leggibile.
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-4">
            <label className="text-xs font-medium text-[var(--prom-muted)]">Cosa vuoi vedere?</label>
            <select
              className="h-11 w-full max-w-xl rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] px-3 text-sm text-[var(--prom-text)] focus-visible:ring-2 focus-visible:ring-[var(--prom-gold)] focus-visible:outline-none"
              value={selectedQueryId}
              onChange={(e) => setSelectedQueryId(e.target.value)}
            >
              {catalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            {selectedCatalogEntry ? (
              <p className="text-xs leading-relaxed text-[var(--prom-muted)]">{selectedCatalogEntry.description}</p>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              className="h-11 w-full rounded-xl font-semibold sm:w-auto sm:min-w-[200px]"
              disabled={nlBusy || !selectedQueryId}
              onClick={() => void runNl()}
            >
              {nlBusy ? "Sto recuperando i dati…" : "Mostrami il riepilogo"}
            </Button>
            {nlSummary ? (
              <p className="text-sm font-medium leading-relaxed text-[var(--prom-text)]">{nlSummary}</p>
            ) : null}
            <NlRowsCards rows={nlRows} />
            <div className="mt-4 flex flex-col gap-3 border-t border-[var(--prom-line)] pt-6 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-xs font-medium text-[var(--prom-muted)]">
                  Un nome per ritrovare questa vista (facoltativo)
                </label>
                <Input
                  value={viewLabel}
                  onChange={(e) => setViewLabel(e.target.value)}
                  placeholder="Es.: controllo ferie prima dell’estate"
                  className="rounded-xl border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)]"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-11 shrink-0 rounded-xl"
                disabled={nlBusy || !viewLabel.trim()}
                onClick={() => void saveView()}
              >
                Salva questa vista
              </Button>
            </div>
          </div>
        </motion.section>

        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <motion.section
            id="controlli"
            className="scroll-mt-24 rounded-3xl border border-[var(--glass-border)] p-6 shadow-[var(--card-shadow)] md:p-8"
            style={{ background: "var(--card-bg)" }}
            {...motionProps}
            variants={fadeUp}
            transition={{ duration: 0.4, delay: 0.08 }}
          >
            <div className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--prom-gold)_22%,transparent)] text-[var(--prom-gold-soft)]">
                <Shield className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[var(--prom-text)]">Controlli intelligenti</h2>
                <p className="mt-1 text-sm leading-relaxed text-[var(--prom-muted)]">
                  Un passaggio veloce per notare piccole cose su ferie e cedolini — spiegato in modo tranquillo.
                </p>
              </div>
            </div>
            <Button
              type="button"
              className="mt-6 h-11 w-full rounded-xl font-semibold"
              disabled={anomalyBusy}
              onClick={() => void runAnomalies()}
            >
              {anomalyBusy ? "Sto controllando…" : "Esegui un controllo ora"}
            </Button>
            {anomalyOut ? (
              <div
                className="mt-4 rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_94%,transparent)] p-4 text-sm leading-relaxed text-[var(--prom-text)] whitespace-pre-wrap"
                role="status"
              >
                {anomalyOut}
              </div>
            ) : null}
          </motion.section>

          <motion.section
            id="capire"
            className="scroll-mt-24 rounded-3xl border border-[var(--glass-border)] p-6 shadow-[var(--card-shadow)] md:p-8"
            style={{ background: "var(--card-bg)" }}
            {...motionProps}
            variants={fadeUp}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <div className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--prom-gold)_22%,transparent)] text-[var(--prom-gold-soft)]">
                <Tags className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[var(--prom-text)]">Capire che tipo di richiesta è</h2>
                <p className="mt-1 text-sm leading-relaxed text-[var(--prom-muted)]">
                  Incolla il testo di una mail o di un messaggio: ti indichiamo il tema e dove conviene andare
                  nell’app.
                </p>
              </div>
            </div>
            <Textarea
              value={triageText}
              onChange={(e) => setTriageText(e.target.value)}
              rows={5}
              placeholder="Es.: ho urgente bisogno di anticipare lo stipendio per un imprevisto medico…"
              className="mt-6 rounded-xl border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_92%,transparent)] text-[var(--prom-text)] placeholder:text-[var(--prom-muted)]"
            />
            <Button
              type="button"
              className="mt-4 h-11 w-full rounded-xl font-semibold"
              disabled={triageBusy || !triageText.trim()}
              onClick={() => void runTriage()}
            >
              {triageBusy ? "Sto classificando…" : "Aiutami a capirla"}
            </Button>
            {triageOut ? (
              <div
                className="mt-4 rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_94%,transparent)] p-4 text-sm leading-relaxed text-[var(--prom-text)] whitespace-pre-wrap"
                role="status"
              >
                {triageOut}
              </div>
            ) : null}
          </motion.section>
        </div>

        <footer className="mt-14 text-center text-xs leading-relaxed text-[var(--prom-muted)]">
          Ogni utilizzo viene registrato in modo anonimo per migliorare il servizio e rispettare le norme sulla privacy.
        </footer>
    </HebbAiExperienceShell>
  );
}
