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
            className="font-synapse text-[1.35rem] font-semibold leading-none tracking-tight text-synapse-text transition-colors group-hover:opacity-90 dark:text-white dark:group-hover:text-white"
            style={{ fontSynthesis: "none" }}
          >
            SYNAPSE
          </span>
          <span className="hidden text-synapse-muted/50 dark:text-white/35 sm:inline" aria-hidden>
            ·
          </span>
          <span
            className="font-synapse text-lg font-semibold leading-none tracking-tight text-synapse-gold transition-colors group-hover:text-synapse-gold-soft dark:text-synapse-gold-bright dark:group-hover:text-[#dcc069]"
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
              <span className="inline-block h-4 w-4 rounded-full bg-black/10 dark:bg-white/20" aria-hidden />
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
