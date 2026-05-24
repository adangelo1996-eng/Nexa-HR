export function NexaPageLoading({ label = "Caricamento…" }: { label?: string }): React.JSX.Element {
  return (
    <div className="mx-auto w-full max-w-6xl animate-pulse space-y-6 px-4 py-8" aria-busy="true" aria-label={label}>
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-lg bg-[color-mix(in_srgb,var(--prom-muted)_18%,transparent)]" />
        <div className="h-4 w-96 max-w-full rounded-md bg-[color-mix(in_srgb,var(--prom-muted)_12%,transparent)]" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-xl border border-[color-mix(in_srgb,var(--prom-muted)_14%,transparent)] bg-[color-mix(in_srgb,var(--prom-muted)_8%,transparent)]"
          />
        ))}
      </div>
      <div className="h-64 rounded-xl border border-[color-mix(in_srgb,var(--prom-muted)_14%,transparent)] bg-[color-mix(in_srgb,var(--prom-muted)_6%,transparent)]" />
      <p className="sr-only">{label}</p>
    </div>
  );
}
