import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Landing pubblica prima dell’accesso (stesso spirito della home Plasticity).
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
        <Button asChild size="md" variant="primary" className="min-w-[10rem]">
          <Link href="/login">Login</Link>
        </Button>
      </div>
    </main>
  );
}
