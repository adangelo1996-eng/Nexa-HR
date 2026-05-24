"use client";

import {
  BarChart3,
  CalendarClock,
  FileSignature,
  FileText,
  Mail,
  Sparkles,
  UserSearch
} from "lucide-react";
import { HebbAiGlassTile } from "@/components/hebb-ai-experience-shell";

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "Giornaliera",
  weekly: "Settimanale",
  monthly: "Mensile",
  quarterly: "Trimestrale",
  yearly: "Annuale",
  on_demand: "Su richiesta"
};

const CONTRACT_KIND_LABELS: Record<string, string> = {
  employment: "Contratto di lavoro",
  remote_working: "Accordo smart working"
};

const DOCUMENT_KIND_LABELS: Record<string, string> = {
  certificate_attendance: "Attestato presenze",
  certificate_training: "Attestato formazione",
  smartworking_letter: "Lettera smart working",
  employment_letter: "Lettera assunzione",
  generic: "Documento generico"
};

const SCOPE_KIND_LABELS: Record<string, string> = {
  self: "Personale",
  employees: "Dipendenti selezionati",
  company: "Tutta l'azienda"
};

const STATUS_LABELS: Record<string, string> = {
  created: "Da creare",
  skipped: "Già presente",
  error: "Errore"
};

const METRIC_LABELS: Record<string, string> = {
  headcount: "Organico",
  pendingLeaves: "Ferie in attesa",
  lowLeaveCount: "Ferie residue basse",
  documentCount: "Documenti vault",
  skillsGapCount: "Gap competenze"
};

type AutomationProposal = {
  id: string;
  title: string;
  description: string;
  workArea: string;
  frequency: string;
  scheduleHint: string;
  estimatedImpact: string;
  actions?: Array<{ type: string; label: string; toolId?: string }>;
};

type ContractResult = {
  contractKind: string;
  scopeKind: string;
  subjectCount: number;
  created: number;
  skipped: number;
  errors: number;
  items: Array<{
    userId: string;
    fullName: string;
    status: string;
    detail?: string;
  }>;
};

type DocumentResult = {
  scopeKind: string;
  documentKind: string;
  title: string;
  created: number;
  items: Array<{
    userId: string;
    fullName: string;
    documentId: string;
    title: string;
  }>;
};

type ReportResult = {
  scopeLabel: string;
  summary: string;
  sections: Array<{ title: string; bullets: string[] }>;
  metrics: Record<string, unknown>;
};

type SkillResult = {
  roleName: string;
  suggestions: Array<{
    skillName: string;
    skillCode: string;
    suggestedLevel: number;
    reason: string;
  }>;
};

type EmailPreviewResult = {
  preview?: DocumentResult;
  targetUserId?: string;
  documentKind?: string;
  delivery?: string;
};

type CvScreeningResult = {
  candidateId?: string;
  positionId?: string;
  preview?: boolean;
  needsCandidateId?: boolean;
  candidateCvScreeningScore?: number;
  screeningSummary?: { summary?: string };
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function extractAutomationProposals(data: unknown): AutomationProposal[] {
  if (Array.isArray(data)) return data as AutomationProposal[];
  if (isRecord(data) && Array.isArray(data.proposals)) return data.proposals as AutomationProposal[];
  return [];
}

function PreviewSection({
  icon: Icon,
  title,
  children
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <HebbAiGlassTile className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-fuchsia-600 dark:text-fuchsia-300" aria-hidden />
        <p className="text-sm font-semibold text-[var(--prom-text)]">{title}</p>
      </div>
      {children}
    </HebbAiGlassTile>
  );
}

function Badge({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="rounded-full border border-[var(--prom-line)] px-2.5 py-1 text-xs text-[var(--prom-muted)]">
      {children}
    </span>
  );
}

function AutomationProposalsPreview({ proposals }: { proposals: AutomationProposal[] }): React.JSX.Element {
  if (proposals.length === 0) {
    return (
      <PreviewSection icon={CalendarClock} title="Automazioni">
        <p className="text-sm text-[var(--prom-muted)]">Nessuna proposta di automazione disponibile.</p>
      </PreviewSection>
    );
  }

  return (
    <PreviewSection icon={CalendarClock} title={`${proposals.length} proposte di automazione`}>
      <ul className="space-y-3">
        {proposals.map((p) => (
          <li
            key={p.id}
            className="rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] p-4"
          >
            <p className="font-medium text-[var(--prom-text)]">{p.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--prom-muted)]">{p.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge>{FREQUENCY_LABELS[p.frequency] ?? p.frequency}</Badge>
              {p.scheduleHint ? <Badge>{p.scheduleHint}</Badge> : null}
              <Badge>Area: {p.workArea === "all" ? "Tutta l'app" : p.workArea}</Badge>
            </div>
            {p.estimatedImpact ? (
              <p className="mt-2 text-xs text-fuchsia-600 dark:text-fuchsia-300">{p.estimatedImpact}</p>
            ) : null}
            {p.actions && p.actions.length > 0 ? (
              <ul className="mt-3 space-y-1 border-t border-[var(--prom-line)] pt-3 text-xs text-[var(--prom-muted)]">
                {p.actions.map((action, idx) => (
                  <li key={`${p.id}-action-${idx}`}>• {action.label}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </PreviewSection>
  );
}

function ContractsPreview({ data }: { data: ContractResult }): React.JSX.Element {
  return (
    <PreviewSection icon={FileSignature} title={CONTRACT_KIND_LABELS[data.contractKind] ?? data.contractKind}>
      <div className="flex flex-wrap gap-2">
        <Badge>{SCOPE_KIND_LABELS[data.scopeKind] ?? data.scopeKind}</Badge>
        <Badge>
          {data.subjectCount} {data.subjectCount === 1 ? "persona" : "persone"}
        </Badge>
        <Badge>{data.created} da creare</Badge>
        {data.skipped > 0 ? <Badge>{data.skipped} già presenti</Badge> : null}
        {data.errors > 0 ? <Badge>{data.errors} errori</Badge> : null}
      </div>
      {data.items.length > 0 ? (
        <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
          {data.items.slice(0, 12).map((item) => (
            <li
              key={item.userId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--prom-line)] px-3 py-2 text-sm"
            >
              <span className="font-medium text-[var(--prom-text)]">{item.fullName}</span>
              <span className="text-xs text-[var(--prom-muted)]">
                {STATUS_LABELS[item.status] ?? item.status}
                {item.detail ? ` · ${item.detail}` : ""}
              </span>
            </li>
          ))}
          {data.items.length > 12 ? (
            <li className="text-xs text-[var(--prom-muted)]">… e altri {data.items.length - 12}</li>
          ) : null}
        </ul>
      ) : null}
    </PreviewSection>
  );
}

function DocumentsPreview({ data }: { data: DocumentResult }): React.JSX.Element {
  const kindLabel = DOCUMENT_KIND_LABELS[data.documentKind] ?? data.documentKind;
  const previewSnippet = `Documento «${data.title}» (${kindLabel}) per ${data.created} destinatari nel perimetro ${SCOPE_KIND_LABELS[data.scopeKind] ?? data.scopeKind}.`;

  return (
    <PreviewSection icon={FileText} title={data.title}>
      <div className="flex flex-wrap gap-2">
        <Badge>{kindLabel}</Badge>
        <Badge>{data.created} destinatari</Badge>
        <Badge>{SCOPE_KIND_LABELS[data.scopeKind] ?? data.scopeKind}</Badge>
      </div>
      <p className="rounded-lg border border-dashed border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2 text-xs leading-relaxed text-[var(--prom-muted)]">
        {previewSnippet}
      </p>
      {data.items.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm text-[var(--prom-muted)]">
          {data.items.slice(0, 8).map((item) => (
            <li key={item.userId}>• {item.fullName}</li>
          ))}
          {data.items.length > 8 ? (
            <li className="text-xs">… e altri {data.items.length - 8}</li>
          ) : null}
        </ul>
      ) : null}
    </PreviewSection>
  );
}

function ReportsPreview({ data }: { data: ReportResult }): React.JSX.Element {
  const metrics = data.metrics ?? {};
  return (
    <PreviewSection icon={BarChart3} title={`Report · ${data.scopeLabel}`}>
      <p className="text-sm leading-relaxed text-[var(--prom-muted)]">{data.summary}</p>
      {Object.keys(metrics).length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(metrics).map(([key, value]) => (
            <div
              key={key}
              className="rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2 text-center"
            >
              <p className="text-lg font-semibold text-fuchsia-600 dark:text-fuchsia-300">{String(value)}</p>
              <p className="text-[10px] uppercase tracking-wide text-[var(--prom-muted)]">
                {METRIC_LABELS[key] ?? key}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-3 space-y-3">
        {data.sections.map((section) => (
          <div key={section.title}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
              {section.title}
            </p>
            <ul className="mt-1 space-y-0.5 text-sm text-[var(--prom-text)]">
              {section.bullets.map((b, i) => (
                <li key={`${section.title}-${i}`}>• {b}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </PreviewSection>
  );
}

function SkillsPreview({ data }: { data: SkillResult }): React.JSX.Element {
  return (
    <PreviewSection icon={Sparkles} title={`Competenze · ${data.roleName}`}>
      <ul className="space-y-2">
        {data.suggestions.map((s) => (
          <li
            key={`${s.skillCode}-${s.skillName}`}
            className="rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium text-[var(--prom-text)]">{s.skillName}</span>
              <span className="text-xs text-fuchsia-600 dark:text-fuchsia-300">Livello {s.suggestedLevel}</span>
            </div>
            <p className="mt-1 text-xs text-[var(--prom-muted)]">{s.reason}</p>
          </li>
        ))}
      </ul>
    </PreviewSection>
  );
}

function EmailPreview({ data }: { data: EmailPreviewResult }): React.JSX.Element {
  const doc = data.preview;
  const recipient = doc?.items[0]?.fullName ?? data.targetUserId ?? "Destinatario";
  const title = doc?.title ?? "Documento HR";
  const kindLabel = DOCUMENT_KIND_LABELS[data.documentKind ?? doc?.documentKind ?? "generic"] ?? "Documento";

  return (
    <PreviewSection icon={Mail} title="Invio documento">
      <div className="space-y-2 text-sm">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <p>
            <span className="text-[var(--prom-muted)]">Destinatario: </span>
            <span className="font-medium text-[var(--prom-text)]">{recipient}</span>
          </p>
          <p>
            <span className="text-[var(--prom-muted)]">Oggetto: </span>
            <span className="font-medium text-[var(--prom-text)]">{title}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{kindLabel}</Badge>
          {data.delivery ? <Badge>Canale: {data.delivery}</Badge> : null}
        </div>
        <p className="rounded-lg border border-dashed border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2 text-xs leading-relaxed text-[var(--prom-muted)]">
          Anteprima: il documento verrà generato nel vault e notificato al destinatario
          {data.delivery === "both"
            ? " (in-app + email)"
            : data.delivery === "webhook"
              ? " via email"
              : " in-app"}
          .
        </p>
      </div>
    </PreviewSection>
  );
}

function CvScreeningPreview({ data }: { data: CvScreeningResult }): React.JSX.Element {
  if (data.needsCandidateId) {
    return (
      <PreviewSection icon={UserSearch} title="Screening CV">
        <p className="text-sm text-[var(--prom-muted)]">
          Indica il candidato nel messaggio o fornisci l&apos;identificativo candidato per avviare lo screening.
        </p>
      </PreviewSection>
    );
  }

  if (data.preview) {
    return (
      <PreviewSection icon={UserSearch} title="Screening CV">
        <div className="flex flex-wrap gap-2">
          {data.candidateId ? <Badge>Candidato: {data.candidateId}</Badge> : null}
          {data.positionId ? <Badge>Posizione: {data.positionId}</Badge> : null}
        </div>
        <p className="mt-2 text-sm text-[var(--prom-muted)]">
          Conferma per avviare la valutazione CV vs posizione con punteggio 0–100 e gap analysis.
        </p>
      </PreviewSection>
    );
  }

  const score = data.candidateCvScreeningScore;
  const summary = data.screeningSummary?.summary;

  return (
    <PreviewSection icon={UserSearch} title="Screening CV completato">
      {typeof score === "number" ? (
        <div className="flex items-center gap-3">
          <span className="text-3xl font-bold text-fuchsia-600 dark:text-fuchsia-300">{score}</span>
          <span className="text-sm text-[var(--prom-muted)]">/ 100</span>
        </div>
      ) : null}
      {summary ? <p className="mt-2 text-sm leading-relaxed text-[var(--prom-text)]">{summary}</p> : null}
    </PreviewSection>
  );
}

export type HebbMatePreviewPanelProps = {
  capability: string;
  payload: unknown;
};

export function HebbMatePreviewPanel({ capability, payload }: HebbMatePreviewPanelProps): React.JSX.Element | null {
  if (payload == null) return null;

  switch (capability) {
    case "automation_proposals":
      return <AutomationProposalsPreview proposals={extractAutomationProposals(payload)} />;
    case "contract_generation":
      if (isRecord(payload) && "contractKind" in payload) {
        return <ContractsPreview data={payload as ContractResult} />;
      }
      break;
    case "document_generation":
      if (isRecord(payload) && "documentKind" in payload) {
        return <DocumentsPreview data={payload as DocumentResult} />;
      }
      break;
    case "reports":
      if (isRecord(payload) && "sections" in payload) {
        return <ReportsPreview data={payload as ReportResult} />;
      }
      break;
    case "skill_suggestions":
      if (isRecord(payload) && "suggestions" in payload) {
        return <SkillsPreview data={payload as SkillResult} />;
      }
      break;
    case "document_email":
      if (isRecord(payload)) {
        return <EmailPreview data={payload as EmailPreviewResult} />;
      }
      break;
    case "cv_screening":
      if (isRecord(payload)) {
        return <CvScreeningPreview data={payload as CvScreeningResult} />;
      }
      break;
    default:
      break;
  }

  return null;
}
