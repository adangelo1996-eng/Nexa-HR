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
        "rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5 shadow-lg shadow-black/40 backdrop-blur-xl",
        className ?? ""
      ].join(" ")}
    >
      {(title || description) && (
        <header className="mb-4 space-y-1">
          {title ? <h2 className="text-sm font-semibold tracking-wide text-slate-50">{title}</h2> : null}
          {description ? (
            <p className="text-xs text-slate-400 leading-relaxed">
              {description}
            </p>
          ) : null}
        </header>
      )}
      <div className="space-y-3 text-sm text-slate-100">{children}</div>
    </section>
  );
}

