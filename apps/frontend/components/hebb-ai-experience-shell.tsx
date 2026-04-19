"use client";

import { Activity, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";

/** Sfondo immersivo allineato al Centro AI HR (gradienti blu marine + page-gradient). */
export const hebbAiImmersiveBackgroundStyle: CSSProperties = {
  background:
    "radial-gradient(1000px 560px at 12% -10%, rgba(0,45,114,0.28), transparent 58%), radial-gradient(780px 460px at 95% 8%, rgba(58,84,102,0.22), transparent 52%), radial-gradient(640px 400px at 48% 110%, rgba(0,45,114,0.14), transparent 48%), var(--page-gradient)"
};

export type HebbAiExperienceShellProps = {
  title: string;
  subtitle?: ReactNode;
  /** Sostituisce il pill predefinito «Hebb AI for HR» (es. wordmark NEXA sul hub). */
  eyebrow?: ReactNode;
  /** Es. pulsante guida, in alto a destra */
  headerTrailing?: ReactNode;
  /** Larghezza massima contenuto */
  contentMax?: "standard" | "wide";
  children: ReactNode;
};

/**
 * Guscio visivo premium per le pagine «Hebb AI for HR»: stesso linguaggio del Centro AI HR
 * (immersivo, glass, tipografia display, motion ridotto se prefers-reduced-motion).
 */
export function HebbAiExperienceShell(props: HebbAiExperienceShellProps): React.JSX.Element {
  const { title, subtitle, eyebrow, headerTrailing, contentMax = "wide", children } = props;
  const reduceMotion = useReducedMotion();
  const maxClass = contentMax === "wide" ? "max-w-5xl" : "max-w-4xl";

  const defaultEyebrow = (
    <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--prom-surface)_78%,transparent)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--prom-muted)] shadow-sm backdrop-blur-md">
      <Activity className="h-3.5 w-3.5 shrink-0 text-[var(--prom-gold)]" aria-hidden />
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--prom-gold)]" aria-hidden />
      <span>HEBB AI FOR HR</span>
    </p>
  );

  const headerMotion = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const }
      };

  const bodyMotion = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 16 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.5, delay: 0.05, ease: [0.22, 1, 0.36, 1] as const }
      };

  return (
    <div className="relative min-h-[calc(100dvh-4rem)] overflow-hidden pb-16 md:pb-24">
      {/* Sfondo immersivo fornito da `AppMainContentFrame` per evitare doppio gradiente */}

      <div className={`relative z-10 mx-auto ${maxClass} px-4 pt-8 md:px-8 md:pt-12`}>
        {headerTrailing ? (
          <div className="absolute right-0 top-6 z-20 md:right-2 md:top-10">{headerTrailing}</div>
        ) : null}

        <motion.header className="text-center" {...headerMotion}>
          {eyebrow ?? defaultEyebrow}
          <h1 className="font-synapse text-balance text-3xl font-semibold tracking-tight text-[var(--prom-text)] md:text-5xl">
            {title}
          </h1>
          {subtitle ? (
            <div className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-[var(--prom-muted)] md:text-lg">
              {subtitle}
            </div>
          ) : null}
        </motion.header>

        <motion.div className="mt-10 space-y-8 md:mt-14" {...bodyMotion}>
          {children}
        </motion.div>
      </div>
    </div>
  );
}

/** Pannello principale (sezioni ampie) — stile card / vetro del hub. */
export function HebbAiGlassPanel(props: { children: ReactNode; className?: string }): React.JSX.Element {
  const { children, className = "" } = props;
  return (
    <div
      className={`rounded-3xl border border-[var(--glass-border)] p-5 shadow-[var(--card-shadow)] backdrop-blur-md md:p-8 ${className}`}
      style={{ background: "var(--card-bg)" }}
    >
      {children}
    </div>
  );
}

/** Tile compatto per KPI / riquadri secondari. */
export function HebbAiGlassTile(props: { children: ReactNode; className?: string }): React.JSX.Element {
  const { children, className = "" } = props;
  return (
    <div
      className={`rounded-2xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--prom-surface)_80%,transparent)] p-4 shadow-[var(--glass-shadow)] backdrop-blur-md ${className}`}
    >
      {children}
    </div>
  );
}

/** Link testuali coerenti con il tema HR / blu Synapse. */
export function hebbAiLinkClassName(): string {
  return "font-medium text-[#002D72] underline decoration-[color-mix(in_srgb,var(--prom-gold)_40%,transparent)] underline-offset-2 transition hover:text-[#001a4d] hover:decoration-[var(--prom-gold)] dark:text-[#6eb0e0] dark:hover:text-[#9cc8ed]";
}

/** Messaggio di errore in pannello vetro (alert). */
export function HebbAiErrorBanner(props: { children: ReactNode }): React.JSX.Element {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-rose-400/35 bg-[color-mix(in_srgb,rose-500_12%,transparent)] px-4 py-3 text-sm text-rose-900 shadow-[var(--glass-shadow)] backdrop-blur-md dark:border-rose-400/25 dark:bg-rose-950/40 dark:text-rose-100"
    >
      {props.children}
    </div>
  );
}
