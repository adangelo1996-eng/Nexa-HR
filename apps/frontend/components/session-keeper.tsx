"use client";

import { useEffect, useRef } from "react";
import { clearSession, getToken, saveSession, type SessionUser } from "@/lib/auth-session";

function refreshUrl(): string {
  const env = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim();
  const origin = (env && env.length > 0 ? env : "http://localhost:4000").replace(/\/+$/, "");
  const apiBase = origin.endsWith("/api") ? origin : `${origin}/api`;
  return `${apiBase}/auth/refresh`;
}

/** Rinnova JWT prima della scadenza (30m) e ripristina cookie sessione per il middleware. */
const REFRESH_INTERVAL_MS = 20 * 60 * 1000;

async function refreshSession(): Promise<boolean> {
  try {
    const res = await fetch(refreshUrl(), {
      method: "POST",
      credentials: "include"
    });
    if (!res.ok) {
      return false;
    }
    const payload = (await res.json()) as { token: string; user: SessionUser };
    if (payload?.token && payload?.user) {
      saveSession(payload.token, payload.user);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Mantiene la sessione attiva: refresh proattivo e ripristino cookie se il JWT è in localStorage
 * ma il cookie `nexa_hr_token` è scaduto (causa tipica del redirect al login dopo ~30 min).
 */
export function SessionKeeper(): null {
  const bootstrapped = useRef(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      return;
    }

    if (!bootstrapped.current) {
      bootstrapped.current = true;
      void refreshSession().then((ok) => {
        if (!ok && !getToken()) {
          clearSession();
        }
      });
    }

    const id = window.setInterval(() => {
      void refreshSession();
    }, REFRESH_INTERVAL_MS);

    const onVisible = (): void => {
      if (document.visibilityState === "visible") {
        void refreshSession();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
