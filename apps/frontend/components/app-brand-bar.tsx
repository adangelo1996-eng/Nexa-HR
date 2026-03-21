"use client";

import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

/**
 * Wordmark SYNAPSE (Golden Rooster, come promethys-site) + prodotto Nexa HR.
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
        <Link href="/" className="group flex flex-wrap items-baseline gap-x-3 gap-y-1 outline-none">
          <span
            className="font-synapse text-[1.35rem] font-semibold leading-none tracking-tight text-slate-900 transition-colors group-hover:text-slate-950 dark:text-slate-100 dark:group-hover:text-white"
            style={{ fontSynthesis: "none" }}
          >
            SYNAPSE
          </span>
          <span className="hidden text-slate-400 dark:text-slate-600 sm:inline" aria-hidden>
            ·
          </span>
          <span
            className="font-synapse text-lg font-semibold leading-none tracking-tight text-cyan-700 transition-colors group-hover:text-cyan-800 dark:text-cyan-300/95 dark:group-hover:text-cyan-200"
            style={{ fontSynthesis: "none" }}
          >
            Nexa HR
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-slate-500 dark:text-slate-500 sm:block">Enterprise HR · CH</span>
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
              <span className="inline-block h-4 w-4 rounded-full bg-slate-300/40 dark:bg-slate-600/50" aria-hidden />
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
