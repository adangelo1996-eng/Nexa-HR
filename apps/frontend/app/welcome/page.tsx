import Link from "next/link";

/**
 * Landing pubblica prima dell’accesso (stesso spirito della home Plasticity).
 * Link primario (stile Button primary) — niente `asChild` sul Button custom: evita errori TypeScript al build.
 */
export default function WelcomePage(): React.JSX.Element {
  return (
    <main className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center px-6 py-16 text-center">
      <p className="mb-4 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
        People operations · Svizzera
      </p>
      <h1
        className="mb-4 max-w-[14ch] bg-gradient-to-b from-[#fff8eb] via-[#dfc282] to-[#c9a03a] bg-clip-text font-synapse text-[clamp(2.75rem,11vw,6.5rem)] font-semibold leading-[0.88] tracking-[0.08em] text-transparent dark:from-white dark:via-[#f0e6c8] dark:to-[#c9a03a]"
        style={{ fontSynthesis: "none" }}
      >
        NEXA HR
      </h1>
      <p className="max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
        Un unico punto per presenze, ferie, organigramma e payroll CH: stessa identità Synapse, priorità chiare e controllo
        operativo quotidiano.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/login"
          className="inline-flex min-w-[10rem] items-center justify-center rounded-lg bg-synapse-gold px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-synapse-gold/45 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:bg-synapse-gold-bright dark:text-neutral-950 dark:hover:brightness-105 dark:focus-visible:ring-synapse-gold-bright/50 dark:focus-visible:ring-offset-[#0b0b0b]"
        >
          Login
        </Link>
      </div>
    </main>
  );
}
