"use client";

import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

/**
 * Stile Central Hub / sito Synapse: SYNAPSE - NEXA HR (tutto maiuscolo).
 */
export function AppBrandBar(): React.JSX.Element {
  const { theme, toggleTheme, mounted } = useTheme();

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
        <Link href="/" className="group flex flex-wrap items-baseline gap-x-0 gap-y-1 outline-none" aria-label="SYNAPSE NEXA HR">
          <span
            className="font-synapse text-[clamp(1.05rem,2.2vw,1.35rem)] font-semibold uppercase leading-none tracking-[0.08em] text-synapse-text transition-colors group-hover:opacity-90 dark:text-white dark:group-hover:text-white"
            style={{ fontSynthesis: "none" }}
          >
            SYNAPSE
          </span>
          <span className="mx-[0.2em] font-sans text-[clamp(0.95rem,1.8vw,1.15rem)] font-semibold text-synapse-text dark:text-white" aria-hidden>
            -
          </span>
          <span
            className="font-sans text-[clamp(0.78rem,1.5vw,0.95rem)] font-semibold uppercase leading-none tracking-[0.12em] text-slate-500 dark:text-slate-400"
            style={{ fontSynthesis: "none" }}
          >
            NEXA HR
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs uppercase tracking-wide text-slate-500 dark:text-slate-500 sm:block">
            Enterprise HR · CH
          </span>
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
