"use client";

import { useCallback, useEffect, useState, type JSX } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  downloadCorporatePolicyBlob,
  fetchCorporatePolicies,
  uploadCorporatePolicy,
  type CorporatePolicyDocumentDto
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r !== "string" || !r.includes(",")) {
        reject(new Error("Lettura file non valida"));
        return;
      }
      resolve(r.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error ?? new Error("Lettura file"));
    reader.readAsDataURL(file);
  });
}

export default function CorporatePoliciesPage(): JSX.Element {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [items, setItems] = useState<CorporatePolicyDocumentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const reload = useCallback(async (): Promise<void> => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setToken(t);
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchCorporatePolicies(t));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const closeUpload = (): void => {
    setUploadOpen(false);
    setTitle("");
    setDescription("");
    setFile(null);
  };

  const onDownload = async (id: string, docTitle: string): Promise<void> => {
    const t = token ?? getToken();
    if (!t) return;
    try {
      const blob = await downloadCorporatePolicyBlob(t, id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${docTitle.replace(/\s+/g, "_").slice(0, 80) || "policy"}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download fallito");
    }
  };

  const onUpload = async (): Promise<void> => {
    const t = token ?? getToken();
    if (!t || !file || !title.trim()) {
      setError("Titolo e file sono obbligatori");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const bodyBase64 = await fileToBase64(file);
      await uploadCorporatePolicy(t, {
        title: title.trim(),
        description: description.trim(),
        mimeType: file.type || undefined,
        originalName: file.name,
        bodyBase64
      });
      closeUpload();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload fallito");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--prom-text)]">Corporate Policies</h1>
          <p className="mt-1 text-sm text-[var(--prom-muted)]">
            Documenti aziendali condivisi. Il caricamento è riservato a ruoli HR/Admin con permesso dedicato.
          </p>
        </div>
        <Button type="button" className="gap-1.5" onClick={() => setUploadOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Aggiungi policy
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Documenti caricati</CardTitle>
          <CardDescription>{loading ? "Caricamento…" : `${items.length} documento/i`}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {items.map((it) => (
            <div
              key={it.id}
              className="flex flex-col gap-1 rounded-md border border-[var(--prom-line)] p-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div>
                <p className="font-medium text-[var(--prom-text)]">{it.title}</p>
                {it.description ? <p className="text-sm text-[var(--prom-muted)]">{it.description}</p> : null}
                <p className="mt-1 text-xs text-[var(--prom-muted)]">
                  {new Date(it.created_at).toLocaleString("it-IT")} · v{it.version}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 shrink-0 sm:mt-0"
                onClick={() => void onDownload(it.id, it.title)}
              >
                Scarica
              </Button>
            </div>
          ))}
          {!loading && items.length === 0 ? (
            <p className="text-sm text-[var(--prom-muted)]">Nessun documento. Usa «Aggiungi policy» per caricare il primo.</p>
          ) : null}
        </CardContent>
      </Card>

      {uploadOpen ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center p-4 sm:items-center" role="presentation">
          <button type="button" className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-label="Chiudi" onClick={closeUpload} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="policy-upload-title"
            className="relative z-10 w-full max-w-lg rounded-2xl border border-[var(--prom-line)] bg-[var(--card-bg)] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-[var(--prom-line)] pb-3">
              <div>
                <h2 id="policy-upload-title" className="text-lg font-semibold text-[var(--prom-text)]">
                  Carica nuova policy
                </h2>
                <p className="mt-1 text-xs text-[var(--prom-muted)]">PDF o Word (max 12 MB lato server).</p>
              </div>
              <Button type="button" variant="ghost" size="sm" className="h-9 w-9 rounded-full p-0" onClick={closeUpload}>
                <X className="h-4 w-4" />
                <span className="sr-only">Chiudi</span>
              </Button>
            </div>
            <div className="flex flex-col gap-3">
              <Input placeholder="Titolo" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Textarea
                placeholder="Breve descrizione"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
              <Input
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={closeUpload} disabled={uploading}>
                  Annulla
                </Button>
                <Button type="button" disabled={uploading || !title.trim() || !file} onClick={() => void onUpload()}>
                  {uploading ? "Invio…" : "Carica"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
