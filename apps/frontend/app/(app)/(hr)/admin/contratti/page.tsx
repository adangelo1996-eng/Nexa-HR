"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchHrContractsByCategory,
  type HrContractCatalogItemDto,
  type HrContractCategoryGroupDto
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";

function shortIso(iso: string): string {
  return iso.slice(0, 10);
}

function itemLinks(item: HrContractCatalogItemDto): { contract?: Route; employee?: Route; document?: Route } {
  const out: { contract?: Route; employee?: Route; document?: Route } = {};
  if (item.contractId && item.source !== "vault") {
    out.contract = `/contracts/${encodeURIComponent(item.contractId)}` as Route;
  }
  if (item.employeeUserId) {
    out.employee = `/employee/${encodeURIComponent(item.employeeUserId)}` as Route;
  }
  if (item.documentId) {
    out.document = `/percorso/documenti?doc=${encodeURIComponent(item.documentId)}` as Route;
  }
  return out;
}

export default function AdminContrattiPage(): React.JSX.Element {
  const router = useRouter();
  const [categories, setCategories] = useState<HrContractCategoryGroupDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterKey, setFilterKey] = useState<string>("all");
  const [query, setQuery] = useState("");

  const reload = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHrContractsByCategory(token);
      setCategories(data.categories ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento contratti");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories
      .filter((c) => filterKey === "all" || c.categoryKey === filterKey)
      .map((c) => ({
        ...c,
        items: c.items.filter((item) => {
          if (!q) return true;
          return (
            item.title.toLowerCase().includes(q) ||
            (item.employeeName ?? "").toLowerCase().includes(q) ||
            item.status.toLowerCase().includes(q)
          );
        })
      }))
      .filter((c) => c.items.length > 0);
  }, [categories, filterKey, query]);

  const totalCount = useMemo(
    () => categories.reduce((acc, c) => acc + c.items.length, 0),
    [categories]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-2 border-b border-[var(--prom-line)] pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--prom-muted)]">Amministrazione</p>
        <h1 className="text-2xl font-semibold text-synapse-text dark:text-white">Contratti</h1>
        <p className="max-w-3xl text-sm text-synapse-muted dark:text-[#b4c9dc]">
          Panoramica di tutti i contratti e accordi per categoria: rapporti di lavoro, smart working, integrazioni e
          documenti firmati nel vault dipendente.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[12rem] flex-1 space-y-1 text-sm">
          <span className="text-synapse-muted dark:text-[#b4c9dc]">Cerca titolo o dipendente</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Es. Rossi, indeterminato, smart working…"
            className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--prom-surface)] px-3 py-2 text-sm text-synapse-text outline-none dark:bg-[#052642]/90 dark:text-white"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="flex items-center gap-1 text-synapse-muted dark:text-[#b4c9dc]">
            <Filter className="h-3.5 w-3.5" aria-hidden />
            Categoria
          </span>
          <select
            value={filterKey}
            onChange={(e) => setFilterKey(e.target.value)}
            className="rounded-lg border border-[var(--card-border)] bg-[var(--prom-surface)] px-3 py-2 text-sm text-synapse-text dark:bg-[#052642]/90 dark:text-white"
          >
            <option value="all">Tutte ({totalCount})</option>
            {categories.map((c) => (
              <option key={c.categoryKey} value={c.categoryKey}>
                {c.categoryLabel} ({c.items.length})
              </option>
            ))}
          </select>
        </label>
        <Button type="button" variant="secondary" size="sm" disabled={loading} onClick={() => void reload()}>
          Aggiorna
        </Button>
        <Link
          href="/contracts"
          className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm text-[#002D72] hover:bg-[color-mix(in_srgb,#002D72_8%,transparent)] dark:text-sky-200"
        >
          Editor contratti standard →
        </Link>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">Caricamento contratti…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-synapse-muted dark:text-[#b4c9dc]">Nessun contratto trovato per i filtri selezionati.</p>
      ) : (
        filtered.map((group) => (
          <Card key={group.categoryKey} className="border-[var(--card-border)]">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,#002D72_12%,transparent)] text-[#002D72] dark:text-sky-200">
                  <FileText className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <CardTitle className="text-base">{group.categoryLabel}</CardTitle>
                  <CardDescription>{group.items.length} elementi</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-[var(--card-border)]">
                {group.items.map((item) => {
                  const links = itemLinks(item);
                  return (
                    <li
                      key={`${item.source}-${item.id}`}
                      className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-synapse-text dark:text-white">{item.title}</p>
                        <p className="text-xs text-synapse-muted dark:text-[#b4c9dc]">
                          {item.status.toUpperCase()} · aggiornato {shortIso(item.updatedAt)}
                          {item.employeeName ? ` · ${item.employeeName}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {links.contract ? (
                          <Link
                            href={links.contract}
                            className="rounded-lg border border-[var(--card-border)] px-2.5 py-1.5 text-xs text-[#002D72] hover:bg-[color-mix(in_srgb,#002D72_8%,transparent)] dark:text-sky-200"
                          >
                            Apri contratto
                          </Link>
                        ) : null}
                        {links.employee ? (
                          <Link
                            href={links.employee}
                            className="rounded-lg border border-[var(--card-border)] px-2.5 py-1.5 text-xs text-synapse-text hover:bg-[color-mix(in_srgb,var(--prom-gold)_10%,transparent)] dark:text-white"
                          >
                            Dipendente
                          </Link>
                        ) : null}
                        {links.document ? (
                          <Link
                            href={links.document}
                            className="rounded-lg border border-[var(--card-border)] px-2.5 py-1.5 text-xs text-synapse-text hover:bg-[color-mix(in_srgb,var(--prom-gold)_10%,transparent)] dark:text-white"
                          >
                            Documento
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
