import Link from "next/link";

/**
 * Wordmark SYNAPSE (Golden Rooster, come promethys-site) + prodotto Nexa HR.
 */
export function AppBrandBar(): React.JSX.Element {
  return (
    <header className="border-b border-slate-800/70 bg-slate-950/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="group flex flex-wrap items-baseline gap-x-3 gap-y-1 outline-none">
          <span
            className="font-synapse text-[1.35rem] font-semibold leading-none tracking-tight text-slate-100 transition-colors group-hover:text-white"
            style={{ fontSynthesis: "none" }}
          >
            SYNAPSE
          </span>
          <span className="hidden text-slate-600 sm:inline" aria-hidden>
            ·
          </span>
          <span
            className="font-synapse text-lg font-semibold leading-none tracking-tight text-cyan-300/95 transition-colors group-hover:text-cyan-200"
            style={{ fontSynthesis: "none" }}
          >
            Nexa HR
          </span>
        </Link>
        <span className="hidden text-xs text-slate-500 sm:block">Enterprise HR · CH</span>
      </div>
    </header>
  );
}
