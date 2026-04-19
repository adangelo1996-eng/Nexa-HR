"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { clearSession, getToken } from "@/lib/auth-session";

const IDLE_MS = 30 * 60 * 1000;
const EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "click", "wheel"] as const;

/**
 * Dopo 30 minuti senza interazione utente: revoca sessione (logout) e torna al login.
 * Il token JWT di accesso è comunque limitato nel tempo lato server.
 */
export function SessionIdleGuard(): null {
  const router = useRouter();
  const pathname = usePathname();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (pathname.startsWith("/login")) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const reset = (): void => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (!getToken()) {
        return;
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (!getToken()) {
          return;
        }
        clearSession();
        if (typeof window !== "undefined") {
          window.location.assign("/login");
        } else {
          router.replace("/login");
        }
      }, IDLE_MS);
    };

    reset();
    for (const ev of EVENTS) {
      window.addEventListener(ev, reset, { passive: true } as AddEventListenerOptions);
    }
    return () => {
      for (const ev of EVENTS) {
        window.removeEventListener(ev, reset);
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [pathname, router]);

  return null;
}
