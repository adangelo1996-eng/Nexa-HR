import Link from "next/link";

/**
 * Landing pubblica: titolo NEXA HR in Golden Rooster (come Plasticity); sottotitolo piccolo sotto.
 * Accenti blu di Prussia / grigio (palette suite).
 */
export default function WelcomePage(): React.JSX.Element {
  return (
    <main className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center px-6 py-16 text-center">
      <p className="mb-[clamp(14px,3vw,22px)] text-[0.65rem] font-medium uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
        PEOPLE OPERATIONS · SVIZZERA
      </p>

      <h1 className="mb-6 flex max-w-[22ch] flex-col items-center gap-[0.65rem]">
        <span
          className="font-synapse text-[clamp(2.75rem,12vw,5.25rem)] font-semibold uppercase leading-[0.92] tracking-[0.06em] text-slate-900 dark:text-[#f5f6fb] dark:[text-shadow:0_0_40px_rgba(255,255,255,0.12),0_0_80px_rgba(255,255,255,0.06)]"
          style={{ fontSynthesis: "none" }}
        >
          NEXA HR
        </span>
        <span className="font-sans text-[clamp(0.62rem,1.85vw,0.78rem)] font-semibold uppercase leading-relaxed tracking-[0.2em] text-[#4d6574] dark:text-[#8aa3b3]">
          — CLOUD ENTERPRISE
        </span>
      </h1>

      <p className="max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-400">
        Un unico punto per presenze, ferie, organigramma e payroll CH: priorità chiare e controllo operativo quotidiano.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/login"
          className="inline-flex min-w-[10rem] items-center justify-center rounded-lg border border-[#3a5466]/35 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-[#3a5466]/50 hover:bg-[#3a5466]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a5466]/35 focus-visible:ring-offset-2 dark:border-[#6b8fa3]/40 dark:bg-white/5 dark:text-slate-100 dark:hover:border-[#6b8fa3]/55 dark:hover:bg-[#6b8fa3]/10 dark:focus-visible:ring-[#6b8fa3]/40 dark:focus-visible:ring-offset-[#0b0b0b]"
        >
          LOGIN
        </Link>
      </div>
    </main>
  );
}
