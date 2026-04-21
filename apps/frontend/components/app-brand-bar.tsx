"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { synapseSuiteDisplayStyle } from "@/lib/synapse-typography";
import { getSessionUser, sessionCanNexaAdmin } from "@/lib/auth-session";
import { useEffect, useState } from "react";

/**
 * Stile Central Hub / sito Synapse: SYNAPSE - NEXA HR (tutto maiuscolo).
 */
export function AppBrandBar(): React.JSX.Element {
  const { theme, toggleTheme, mounted } = useTheme();
  const pathname = usePathname();
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    const u = getSessionUser();
    setShowAdmin(sessionCanNexaAdmin(u));
  }, [pathname]);

  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur-xl transition-colors duration-300"
      style={{
        background: "var(--bar-bg)",
        borderColor: "var(--bar-border)",
        boxShadow: "var(--bar-shadow)"
      }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
        <Link
          href="/mappa-portale"
          className="group flex flex-wrap items-baseline gap-x-0 gap-y-1 outline-none"
          aria-label="SYNAPSE NEXA HR"
        >
          <span
            className="nexa-wordmark-face text-[clamp(1.05rem,2.2vw,1.35rem)] font-semibold uppercase leading-none tracking-[0.08em] text-synapse-text transition-colors group-hover:opacity-90 dark:text-white dark:group-hover:text-white"
            style={synapseSuiteDisplayStyle}
          >
            SYNAPSE
          </span>
          <span
            className="nexa-wordmark-face mx-[0.2em] text-[clamp(0.95rem,1.8vw,1.15rem)] font-semibold text-synapse-text dark:text-white"
            style={synapseSuiteDisplayStyle}
            aria-hidden
          >
            -
          </span>
          <span
            className="nexa-wordmark-face text-[clamp(0.78rem,1.5vw,0.95rem)] font-semibold uppercase leading-none tracking-[0.12em] text-slate-500 dark:text-slate-400"
            style={synapseSuiteDisplayStyle}
          >
            NEXA HR
          </span>
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <nav className="mr-1 flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-600 dark:text-slate-400">
            <Link href="/mappa-portale" className="hover:text-synapse-text dark:hover:text-white">
              Dashboard
            </Link>
            <span className="text-slate-400" aria-hidden>
              |
            </span>
            <Link href="/attendance" className="hover:text-synapse-text dark:hover:text-white">
              Timbrature
            </Link>
            <span className="text-slate-400" aria-hidden>
              |
            </span>
            <Link href="/settings" className="hover:text-synapse-text dark:hover:text-white">
              Impostazioni
            </Link>
            {showAdmin ? (
              <>
                <span className="text-slate-400" aria-hidden>
                  |
                </span>
                <Link href="/admin" className="hover:text-synapse-text dark:hover:text-white">
                  Admin
                </Link>
              </>
            ) : null}
          </nav>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 shrink-0 rounded-full px-0"
            onClick={() => toggleTheme()}
            disabled={!mounted}
            aria-label={theme === "dark" ? "Passa a tema chiaro" : "Passa a tema scuro"}
            title={theme === "dark" ? "Tema chiaro" : "Tema scuro"}
          >
            {mounted ? (
              theme === "dark" ? (
                <Sun className="h-4 w-4" aria-hidden />
              ) : (
                <Moon className="h-4 w-4" aria-hidden />
              )
            ) : (
              <span className="inline-block h-4 w-4 rounded-full bg-black/10 dark:bg-white/20" aria-hidden />
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
