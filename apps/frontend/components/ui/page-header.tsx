import * as React from "react";

function cn(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(" ");
}

export function PageHeader(props: {
  kicker?: string;
  title: string;
  lead?: string;
  className?: string;
}): React.JSX.Element {
  return (
    <header className={cn("space-y-1 pb-2", props.className)}>
      {props.kicker ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6e6e73] dark:text-[#b4c9dc]">
          {props.kicker}
        </p>
      ) : null}
      <h1 className="text-[1.75rem] font-semibold tracking-tight text-[#1c1c1e] dark:text-white">{props.title}</h1>
      {props.lead ? <p className="max-w-xl text-[15px] leading-snug text-[#6e6e73] dark:text-[#b4c9dc]">{props.lead}</p> : null}
    </header>
  );
}

export function ListRow(props: {
  label: string;
  value?: React.ReactNode;
  hint?: string;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-[var(--prom-line)] px-4 py-3 last:border-b-0",
        props.className
      )}
    >
      <div className="min-w-0">
        <p className="text-[15px] text-[#1c1c1e] dark:text-white">{props.label}</p>
        {props.hint ? <p className="text-[13px] text-[#6e6e73] dark:text-[#b4c9dc]">{props.hint}</p> : null}
      </div>
      {props.value != null ? <div className="shrink-0 text-[15px] text-[#6e6e73] dark:text-[#b4c9dc]">{props.value}</div> : null}
    </div>
  );
}
