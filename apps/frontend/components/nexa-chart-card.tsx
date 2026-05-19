"use client";

import type { ReactNode } from "react";

export type NexaChartCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** Fixed chart area height in px (ResponsiveContainer). Default 240. */
  height?: number;
};

export function NexaChartCard(props: NexaChartCardProps): React.JSX.Element {
  const { title, description, children, className = "", height = 240 } = props;
  return (
    <section
      className={`rounded-2xl border border-[var(--card-border)] p-4 ${className}`}
      style={{ background: "var(--card-bg)" }}
    >
      <div className="mb-3">
        <h3
          className="text-sm font-semibold text-[var(--prom-text)]"
          style={{ fontFamily: "var(--font-synapse-body), Montserrat, sans-serif" }}
        >
          {title}
        </h3>
        {description ? <p className="mt-1 text-xs leading-relaxed text-[var(--prom-muted)]">{description}</p> : null}
      </div>
      <div className="w-full" style={{ height }}>
        {children}
      </div>
    </section>
  );
}
