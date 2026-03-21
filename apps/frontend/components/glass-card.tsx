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
        "rounded-2xl border p-5 shadow-lg backdrop-blur-xl transition-colors duration-300",
        "border-slate-200/80 bg-white/65 shadow-slate-900/5",
        "dark:border-slate-700/60 dark:bg-slate-900/55 dark:shadow-black/40",
        className ?? ""
      ].join(" ")}
    >
      {(title || description) && (
        <header className="mb-4 space-y-1">
          {title ? (
            <h2 className="text-sm font-semibold tracking-wide text-slate-900 dark:text-slate-50">{title}</h2>
          ) : null}
          {description ? (
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">{description}</p>
          ) : null}
        </header>
      )}
      <div className="space-y-3 text-sm text-slate-800 dark:text-slate-100">{children}</div>
    </section>
  );
}
