"use client";

import type { CSSProperties, ReactNode } from "react";
import { usePathname } from "next/navigation";

/** Sfondo brand coerente con Hebb AI, più leggero del guscio pagina intera per non «sommare» troppo con `HebbAiExperienceShell`. */
const appWideBackdropStyle: CSSProperties = {
  background:
    "radial-gradient(880px 480px at 10% -8%, rgba(0,45,114,0.14), transparent 58%), radial-gradient(640px 380px at 92% 4%, rgba(58,84,102,0.1), transparent 50%), var(--page-gradient)"
};

const orbSoftStyle: CSSProperties = {
  background: "radial-gradient(circle, rgba(0,45,114,0.2) 0%, transparent 72%)"
};

export type AppMainContentFrameProps = {
  children: ReactNode;
};

/**
 * Contenuto principale autenticato: stesso linguaggio visivo delle pagine AI (gradiente Synapse + orb leggero),
 * variante `dense` per console admin (meno decorazione).
 */
export function AppMainContentFrame(props: AppMainContentFrameProps): React.JSX.Element {
  const pathname = usePathname();
  const dense = pathname.startsWith("/admin");

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto">
      <div
        className={`pointer-events-none absolute inset-0 ${dense ? "opacity-80" : "opacity-[0.97]"}`}
        style={appWideBackdropStyle}
      />
      {!dense ? (
        <div
          className="pointer-events-none absolute left-1/2 top-6 h-64 w-64 -translate-x-1/2 rounded-full blur-3xl motion-safe:animate-pulse md:top-10 md:h-72 md:w-72"
          style={orbSoftStyle}
        />
      ) : null}
      <div className="relative z-[1] min-h-full">{props.children}</div>
    </div>
  );
}
