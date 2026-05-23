"use client";

import type React from "react";
import { MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Pulsante chat: apre l’assistente LLM integrato (Centro AI) con mappa reale dell’app
 * (permessi effettivi restano lato server sulle API).
 */
export function SelfServiceChat(): React.JSX.Element {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        router.push("/hebb-ai-support");
      }}
      className="fixed bottom-6 left-6 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--prom-line-strong)] bg-[var(--prom-surface)] text-[var(--prom-text)] shadow-[var(--card-shadow)] transition-[transform,opacity] hover:opacity-90 md:bottom-8 md:left-8"
      aria-label="Apri assistente AI Nexa HR"
      title="Assistente AI (LLM) — chiedi sulla piattaforma in base ai tuoi permessi"
    >
      <MessageCircle className="h-6 w-6" />
    </button>
  );
}
