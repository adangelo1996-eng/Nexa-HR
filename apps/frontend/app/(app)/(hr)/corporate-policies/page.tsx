"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

export default function CorporatePoliciesPage(): React.JSX.Element {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [items, setItems] = useState<CorporatePolicyDocumentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      setTitle("");
      setDescription("");
      setFile(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload fallito");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Corporate Policies</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Documenti aziendali condivisi. Il caricamento è riservato a ruoli HR/Admin con permesso dedicato.
        </p>
      </div>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Carica policy</CardTitle>
          <CardDescription>PDF o Word (max 12 MB lato server).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input placeholder="Titolo" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea placeholder="Breve descrizione" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          <Input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button type="button" disabled={uploading || !title.trim() || !file} onClick={() => void onUpload()}>
            {uploading ? "Invio…" : "Carica"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Elenco documenti</CardTitle>
          <CardDescription>{loading ? "Caricamento…" : `${items.length} documento/i`}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {items.map((it) => (
            <div key={it.id} className="flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-medium">{it.title}</p>
                {it.description ? <p className="text-muted-foreground text-sm">{it.description}</p> : null}
                <p className="text-muted-foreground mt-1 text-xs">
                  {new Date(it.created_at).toLocaleString("it-IT")} · v{it.version}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" className="mt-2 shrink-0 sm:mt-0" onClick={() => void onDownload(it.id, it.title)}>
                Scarica
              </Button>
            </div>
          ))}
          {!loading && items.length === 0 ? <p className="text-muted-foreground text-sm">Nessun documento.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
