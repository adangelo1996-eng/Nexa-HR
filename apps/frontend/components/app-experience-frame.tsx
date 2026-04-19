"use client";

import type { CSSProperties, ReactNode } from "react";
import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { hebbAiImmersiveBackgroundStyle } from "@/components/hebb-ai-experience-shell";

const orbSoftStyle: CSSProperties = {
  background: "radial-gradient(circle, rgba(0,45,114,0.38) 0%, transparent 72%)"
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
  const portalMap = (pathname.replace(/\/$/, "") || "/") === "/mappa-portale";
  const mainScrollRef = useRef<HTMLDivElement>(null);
  /** Mappa portale: stesso gradiente pagina del resto dell’app (chiaro/scuro via token), senza overlay Hebb che appesantisce il chiaro. */
  const frameBackgroundStyle =
    dense || portalMap ? { background: "var(--page-gradient)" } : hebbAiImmersiveBackgroundStyle;

  useLayoutEffect(() => {
    const el = mainScrollRef.current;
    if (el) {
      el.scrollTop = 0;
    }
  }, [pathname]);

  return (
    <div
      ref={mainScrollRef}
      className="relative min-h-0 flex-1 overflow-y-auto"
    >
      {/*
        Sfondo nel flusso con min-h-full: copre tutta l’altezza del contenuto scrollabile.
        (absolute inset-0 si ancorava solo all’altezza visibile e la sfumatura “finiva” a metà pagina.)
      */}
      <div
        className={`relative isolate min-h-full w-full ${dense || portalMap ? "opacity-100" : "opacity-95"}`}
        style={frameBackgroundStyle}
      >
        {!dense && !portalMap ? (
          <div
            className="pointer-events-none absolute left-1/2 top-10 z-0 h-72 w-72 -translate-x-1/2 rounded-full blur-3xl motion-safe:animate-pulse md:top-16 md:h-80 md:w-80"
            style={orbSoftStyle}
          />
        ) : null}
        <div className="relative z-[1] min-h-full">{props.children}</div>
      </div>
    </div>
  );
}
