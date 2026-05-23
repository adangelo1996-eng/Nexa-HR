"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  FileText,
  Loader2,
  PencilLine,
  Sparkles,
  UserRound
} from "lucide-react";
import {
  downloadDocumentVaultFile,
  fetchAiAssistantOrgUsers,
  fetchAiAssistantScopeOptions,
  fetchDocumentVault,
  fetchUsers,
  uploadDocumentToVault,
  type EmployeeDocumentDto
} from "@/lib/api";
import {
  getSessionUser,
  getToken,
  sessionCanHrExtendedOrTeamAttendance,
  sessionCanNexaAdmin
} from "@/lib/auth-session";
import { HebbFieldAssistButton } from "@/components/hebb-field-assist";
import { GlassConfirmDialog } from "@/components/glass-confirm-dialog";
import { Button } from "@/components/ui/button";
import { HebbAiGlassPanel } from "@/components/hebb-ai-experience-shell";

const DOC_KIND_LABELS: Record<EmployeeDocumentDto["kind"], string> = {
  contract: "Contratto",
  payslip: "Cedolino",
  personal: "Personale",
  other: "Altro"
};

const DOC_FORM_ID = "hr.cowork.documents";

function formatDocDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("it-IT", { dateStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error ?? new Error("Lettura file fallita"));
    reader.readAsDataURL(blob);
  });
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type HebbMateDocumentsPanelProps = {
  costCenterId?: string;
  teamId?: string;
};

export function HebbMateDocumentsPanel({
  costCenterId = "",
  teamId = ""
}: HebbMateDocumentsPanelProps): React.JSX.Element {
  const me = getSessionUser();
  const [personOptions, setPersonOptions] = useState<Array<{ userId: string; label: string }>>([]);
  const [targetUserId, setTargetUserId] = useState("");
  const [orgUserQuery, setOrgUserQuery] = useState("");
  const [orgUserResults, setOrgUserResults] = useState<Array<{ userId: string; label: string }>>([]);
  const [orgUserSearchBusy, setOrgUserSearchBusy] = useState(false);
  const [canSearchOrg, setCanSearchOrg] = useState(false);

  const [documents, setDocuments] = useState<EmployeeDocumentDto[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [vaultReadDenied, setVaultReadDenied] = useState(false);

  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [proposedTitle, setProposedTitle] = useState("");
  const [proposedKind, setProposedKind] = useState<EmployeeDocumentDto["kind"]>("other");
  const [hitlPreviewOpen, setHitlPreviewOpen] = useState(false);
  const [confirmPublishOpen, setConfirmPublishOpen] = useState(false);
  const [downloadBusyId, setDownloadBusyId] = useState<string | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);

  const canWriteGuess = useMemo(() => {
    if (!me) return false;
    if (me.role === "superuser" || sessionCanNexaAdmin(me) || sessionCanHrExtendedOrTeamAttendance(me)) return true;
    if (me.isTeamResponsible || me.hasDirectReports) return true;
    return false;
  }, [me]);

  const selectedDoc = useMemo(
    () => documents.find((d) => d.id === selectedDocId) ?? null,
    [documents, selectedDocId]
  );

  const loadPersonOptions = useCallback(async () => {
    const token = getToken();
    if (!token || !me) return;
    try {
      const [users, scope] = await Promise.all([
        fetchUsers(token),
        fetchAiAssistantScopeOptions(token).catch(() => null)
      ]);
      const cc = costCenterId.trim();
      const team = teamId.trim();
      const filtered = users.filter((u) => {
        if (cc && u.costCenterId !== cc) return false;
        if (team && u.teamId !== team) return false;
        return true;
      });
      const byId = new Map<string, { userId: string; label: string }>();
      byId.set(me.id, { userId: me.id, label: `${me.fullName} (tu)` });
      for (const u of filtered) {
        byId.set(u.id, { userId: u.id, label: u.fullName?.trim() || u.email || u.id });
      }
      for (const m of scope?.managedUsers ?? []) {
        if (!byId.has(m.userId)) byId.set(m.userId, m);
      }
      const opts = [...byId.values()].sort((a, b) => a.label.localeCompare(b.label, "it"));
      setPersonOptions(opts);
      setCanSearchOrg(scope?.modesAllowed.includes("cost_center") === true);
      setTargetUserId((prev) => (prev && opts.some((o) => o.userId === prev) ? prev : me.id));
    } catch {
      setPersonOptions(me ? [{ userId: me.id, label: `${me.fullName} (tu)` }] : []);
      setTargetUserId(me?.id ?? "");
    }
  }, [me, costCenterId, teamId]);

  useEffect(() => {
    void loadPersonOptions();
  }, [loadPersonOptions]);

  useEffect(() => {
    const token = getToken();
    if (!token || !canSearchOrg || orgUserQuery.trim().length < 2) {
      setOrgUserResults([]);
      return;
    }
    const handle = window.setTimeout(() => {
      setOrgUserSearchBusy(true);
      void fetchAiAssistantOrgUsers(token, orgUserQuery.trim())
        .then((res) => setOrgUserResults(res.users))
        .catch(() => setOrgUserResults([]))
        .finally(() => setOrgUserSearchBusy(false));
    }, 280);
    return () => window.clearTimeout(handle);
  }, [orgUserQuery, canSearchOrg]);

  const loadDocuments = useCallback(async () => {
    const token = getToken();
    const uid = targetUserId.trim();
    if (!token || !uid) return;
    setDocsLoading(true);
    setDocsError(null);
    setVaultReadDenied(false);
    setApplySuccess(null);
    try {
      const res = await fetchDocumentVault(token, uid);
      setDocuments(res.items);
      setSelectedDocId((prev) => (prev && res.items.some((d) => d.id === prev) ? prev : null));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore caricamento documenti";
      setDocuments([]);
      setVaultReadDenied(/non autorizzat|403|forbidden/i.test(msg));
      setDocsError(msg);
    } finally {
      setDocsLoading(false);
    }
  }, [targetUserId]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const startEdit = useCallback((doc: EmployeeDocumentDto) => {
    setSelectedDocId(doc.id);
    setProposedTitle(doc.title);
    setProposedKind(doc.kind);
    setHitlPreviewOpen(false);
    setApplyError(null);
    setApplySuccess(null);
  }, []);

  const openHitlPreview = useCallback(() => {
    if (!selectedDoc) return;
    if (!proposedTitle.trim()) {
      setApplyError("Inserisci un titolo per la modifica proposta.");
      return;
    }
    setApplyError(null);
    setHitlPreviewOpen(true);
  }, [selectedDoc, proposedTitle]);

  const runDownload = useCallback(async (doc: EmployeeDocumentDto) => {
    const token = getToken();
    if (!token) return;
    setDownloadBusyId(doc.id);
    setDocsError(null);
    try {
      const blob = await downloadDocumentVaultFile(token, doc.id);
      const ext =
        doc.mimeType?.includes("pdf") ? "pdf" : doc.mimeType?.includes("png") ? "png" : "bin";
      triggerBrowserDownload(blob, `${doc.title.replace(/[^\w.-]+/g, "_").slice(0, 80)}.${ext}`);
    } catch (e) {
      setDocsError(e instanceof Error ? e.message : "Download non disponibile");
    } finally {
      setDownloadBusyId(null);
    }
  }, []);

  const confirmApplyModification = useCallback(async () => {
    const token = getToken();
    if (!token || !selectedDoc || !targetUserId.trim()) return;
    setApplyBusy(true);
    setApplyError(null);
    setApplySuccess(null);
    try {
      let bodyBase64: string | undefined;
      let mimeType = selectedDoc.mimeType;
      try {
        const blob = await downloadDocumentVaultFile(token, selectedDoc.id);
        bodyBase64 = await blobToBase64(blob);
        mimeType = blob.type || mimeType;
      } catch {
        bodyBase64 = undefined;
      }
      const created = await uploadDocumentToVault(token, {
        title: proposedTitle.trim(),
        kind: proposedKind,
        mimeType,
        bodyBase64,
        targetUserId: targetUserId.trim()
      });
      setHitlPreviewOpen(false);
      setConfirmPublishOpen(false);
      setApplySuccess(`Nuova versione registrata: «${created.title}».`);
      setSelectedDocId(null);
      await loadDocuments();
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : "Pubblicazione non riuscita");
    } finally {
      setApplyBusy(false);
    }
  }, [selectedDoc, proposedTitle, proposedKind, targetUserId, loadDocuments]);

  const partialForm = useMemo(
    () => ({ title: proposedTitle, kind: proposedKind }),
    [proposedTitle, proposedKind]
  );

  return (
    <HebbAiGlassPanel className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-[var(--prom-accent)]" aria-hidden />
          <div>
            <h2 className="text-lg font-semibold text-[var(--prom-text)]">Vault documenti per persona</h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--prom-muted)]">
              Elenco, download e modifica con approvazione HITL. La conferma registra una nuova versione in vault; la
              scheda precedente resta in archivio.
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={docsLoading} onClick={() => void loadDocuments()}>
          Aggiorna elenco
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="mate-doc-person" className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
            <UserRound className="h-3.5 w-3.5" aria-hidden />
            Persona
          </label>
          <select
            id="mate-doc-person"
            value={targetUserId}
            onChange={(e) => {
              setTargetUserId(e.target.value);
              setSelectedDocId(null);
              setHitlPreviewOpen(false);
            }}
            className="w-full rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2 text-sm text-[var(--prom-text)]"
          >
            {personOptions.map((o) => (
              <option key={o.userId} value={o.userId}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {canSearchOrg ? (
          <div className="space-y-2">
            <label htmlFor="mate-doc-org-q" className="text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
              Cerca dipendente (org)
            </label>
            <input
              id="mate-doc-org-q"
              value={orgUserQuery}
              onChange={(e) => setOrgUserQuery(e.target.value)}
              placeholder="Nome o email…"
              className="w-full rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2 text-sm text-[var(--prom-text)]"
            />
            {orgUserSearchBusy ? (
              <p className="text-[11px] text-[var(--prom-muted)]">Ricerca…</p>
            ) : null}
            {orgUserResults.length > 0 ? (
              <ul className="max-h-28 overflow-y-auto rounded-xl border border-[var(--prom-line)] text-sm">
                {orgUserResults.map((u) => (
                  <li key={u.userId} className="border-b border-[var(--prom-line)] last:border-0">
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-[color-mix(in_srgb,var(--prom-accent)_8%,transparent)]"
                      onClick={() => {
                        setTargetUserId(u.userId);
                        setOrgUserQuery(u.label);
                        setOrgUserResults([]);
                        setSelectedDocId(null);
                      }}
                    >
                      {u.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {vaultReadDenied ? (
        <p className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          Accesso al vault negato per questa persona. Serve il permesso <strong>nexa.documents:read</strong> e un
          rapporto manager/team lead (o HR).
        </p>
      ) : null}
      {docsError && !vaultReadDenied ? (
        <p className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200">
          {docsError}
        </p>
      ) : null}
      {applySuccess ? (
        <p className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100">
          {applySuccess}
        </p>
      ) : null}

      {docsLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-[var(--prom-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Caricamento documenti…
        </div>
      ) : documents.length === 0 && !docsError ? (
        <p className="rounded-xl border border-dashed border-[var(--prom-line)] px-4 py-8 text-center text-sm text-[var(--prom-muted)]">
          Nessun documento in vault per la persona selezionata.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--prom-line)]">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="border-b border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_95%,transparent)] text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">
              <tr>
                <th className="px-3 py-2">Titolo</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Caricato</th>
                <th className="px-3 py-2 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr
                  key={doc.id}
                  className={`border-b border-[var(--prom-line)] last:border-0 ${
                    selectedDocId === doc.id ? "bg-[color-mix(in_srgb,var(--prom-accent)_6%,transparent)]" : ""
                  }`}
                >
                  <td className="px-3 py-2.5 font-medium text-[var(--prom-text)]">{doc.title}</td>
                  <td className="px-3 py-2.5 text-[var(--prom-muted)]">{DOC_KIND_LABELS[doc.kind]}</td>
                  <td className="px-3 py-2.5 text-[var(--prom-muted)]">{formatDocDate(doc.createdAt)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={downloadBusyId === doc.id}
                        onClick={() => void runDownload(doc)}
                        title="Scarica file"
                      >
                        {downloadBusyId === doc.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Download className="h-3.5 w-3.5" aria-hidden />
                        )}
                      </Button>
                      {canWriteGuess ? (
                        <Button type="button" variant="outline" size="sm" onClick={() => startEdit(doc)} title="Proponi modifica">
                          <PencilLine className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedDoc && canWriteGuess ? (
        <div className="rounded-xl border border-[color-mix(in_srgb,var(--prom-accent)_28%,var(--prom-line))] bg-[color-mix(in_srgb,var(--prom-accent)_4%,transparent)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Proponi modifica (HITL)</p>
          <p className="mt-1 text-sm text-[var(--prom-muted)]">
            Documento origine: <span className="font-medium text-[var(--prom-text)]">{selectedDoc.title}</span>
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 flex items-center justify-between gap-2 text-[var(--prom-muted)]">
                Nuovo titolo
                <HebbFieldAssistButton
                  fieldKey="title"
                  formId={DOC_FORM_ID}
                  partialForm={partialForm}
                  context={{ documentKind: proposedKind }}
                  onSuggest={(res) => setProposedTitle(String(res.value ?? ""))}
                />
              </span>
              <input
                value={proposedTitle}
                onChange={(e) => setProposedTitle(e.target.value)}
                className="w-full rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2 text-sm text-[var(--prom-text)]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 flex items-center justify-between gap-2 text-[var(--prom-muted)]">
                Tipologia
                <HebbFieldAssistButton
                  fieldKey="kind"
                  formId={DOC_FORM_ID}
                  partialForm={partialForm}
                  onSuggest={(res) => setProposedKind(String(res.value ?? "other") as EmployeeDocumentDto["kind"])}
                />
              </span>
              <select
                value={proposedKind}
                onChange={(e) => setProposedKind(e.target.value as EmployeeDocumentDto["kind"])}
                className="w-full rounded-xl border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] px-3 py-2 text-sm text-[var(--prom-text)]"
              >
                {(Object.keys(DOC_KIND_LABELS) as EmployeeDocumentDto["kind"][]).map((k) => (
                  <option key={k} value={k}>
                    {DOC_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {hitlPreviewOpen ? (
            <div className="mt-4 grid gap-2 rounded-lg border border-[var(--prom-line)] bg-[var(--prom-surface-soft)] p-3 text-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Anteprima HITL</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-medium text-[var(--prom-muted)]">Prima</p>
                  <p className="text-[var(--prom-text)]">
                    {selectedDoc.title} · {DOC_KIND_LABELS[selectedDoc.kind]}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-[var(--prom-muted)]">Dopo (nuova scheda)</p>
                  <p className="text-[var(--prom-text)]">
                    {proposedTitle.trim()} · {DOC_KIND_LABELS[proposedKind]}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setSelectedDocId(null)}>
              Annulla
            </Button>
            <Button type="button" size="sm" onClick={openHitlPreview} className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              {hitlPreviewOpen ? "Rivedi anteprima" : "Proponi modifica"}
            </Button>
            {hitlPreviewOpen ? (
              <Button
                type="button"
                size="sm"
                disabled={applyBusy}
                onClick={() => setConfirmPublishOpen(true)}
              >
                Pubblica in vault
              </Button>
            ) : null}
          </div>
          {applyError ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{applyError}</p> : null}
          <p className="mt-2 text-[11px] text-[var(--prom-muted)]">
            Richiede <strong>nexa.documents:write</strong>. Per batch da linguaggio naturale usa la chat Cowork sotto
            (es. registra documento / promemoria lettura).
          </p>
        </div>
      ) : null}

      <GlassConfirmDialog
        open={confirmPublishOpen && selectedDoc !== null}
        title="Confermare la modifica?"
        message={
          selectedDoc
            ? `Pubblicare «${proposedTitle.trim()}» (${DOC_KIND_LABELS[proposedKind]}) al posto di «${selectedDoc.title}»? Verrà creata una nuova scheda in vault; il file viene ricopiato se scaricabile.`
            : ""
        }
        confirmLabel="Pubblica in vault"
        cancelLabel="Indietro"
        busy={applyBusy}
        onCancel={() => {
          if (!applyBusy) setConfirmPublishOpen(false);
        }}
        onConfirm={() => void confirmApplyModification()}
      />
    </HebbAiGlassPanel>
  );
}
