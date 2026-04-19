"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { GlassCard } from "@/components/glass-card";
import { fetchHrCenterMeta } from "@/lib/api";
import { getToken } from "@/lib/auth-session";

const TABS: { href: Route; label: string }[] = [
  { href: "/hr-center/analisi" as Route, label: "Analisi costi" },
  { href: "/hr-center/contratti" as Route, label: "Contratti (LLM)" },
  { href: "/hr-center/recap" as Route, label: "Recap AI dipendenti" }
];

export default function HrCenterLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  const pathname = usePathname();
  const [gate, setGate] = useState<"loading" | "ok" | "denied">("loading");
  const [denyMsg, setDenyMsg] = useState<string>("");

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setDenyMsg("Sessione non valida.");
      setGate("denied");
      return;
    }
    let cancelled = false;
    void fetchHrCenterMeta(token)
      .then((m) => {
        if (cancelled) return;
        if (!m.canAccess) {
          setDenyMsg("Non hai accesso al Centro HR per il tuo profilo.");
          setGate("denied");
        } else {
          setGate("ok");
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setDenyMsg(e instanceof Error ? e.message : "Errore di verifica accessi.");
          setGate("denied");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (gate === "loading") {
    return (
      <div className="py-12 text-center text-sm text-[var(--prom-muted)]">Verifica accessi Centro HR…</div>
    );
  }

  if (gate === "denied") {
    return (
      <div className="mx-auto max-w-lg py-10">
        <GlassCard title="Centro HR" description="Accesso non disponibile">
          <p className="text-sm text-rose-600 dark:text-rose-300">{denyMsg}</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--prom-text)]">Centro HR</h1>
        <p className="text-xs text-[var(--prom-muted)]">
          Analisi su dati pseudonimizzati, bozze contratto assistite e recap per dipendente. I documenti vanno sempre
          verificati da HR prima dell&apos;uso ufficiale.
        </p>
      </header>
      <nav className="flex flex-wrap gap-2 border-b border-[var(--prom-line)] pb-2">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-[color-mix(in_srgb,var(--prom-gold)_22%,transparent)] text-[var(--prom-text)]"
                  : "text-[var(--prom-muted)] hover:bg-[color-mix(in_srgb,var(--prom-surface)_80%,transparent)]"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
