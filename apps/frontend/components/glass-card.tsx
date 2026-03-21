"use client";

import type React from "react";

interface GlassCardProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function GlassCard({ title, description, children, className }: GlassCardProps): React.JSX.Element {
  return (
    <section
      className={[
        "rounded-2xl border p-5 shadow-lg backdrop-blur-xl transition-[border-color,background,box-shadow] duration-300",
        "border-[color:var(--glass-border)] bg-[var(--glass-bg)] shadow-[var(--glass-shadow)]",
        className ?? ""
      ].join(" ")}
    >
      {(title || description) && (
        <header className="mb-4 space-y-1">
          {title ? (
            <h2 className="text-sm font-semibold tracking-wide text-synapse-text dark:text-white">{title}</h2>
          ) : null}
          {description ? (
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">{description}</p>
          ) : null}
        </header>
      )}
      <div className="space-y-3 text-sm text-synapse-text dark:text-white/95">{children}</div>
    </section>
  );
}
