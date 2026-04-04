"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchCurrentUser } from "@/lib/api";
import { getToken, sessionCanNexaAdmin } from "@/lib/auth-session";

/**
 * Blocca `/admin` se la sessione non ha `canNexaAdmin` (solo account Synapse allowlist).
 */
export function AdminAccessGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    void fetchCurrentUser(token)
      .then((u) => {
        if (cancelled) {
          return;
        }
        if (!sessionCanNexaAdmin(u)) {
          router.replace("/");
          return;
        }
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          router.replace("/login");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--prom-muted)]">
        Verifica accesso…
      </div>
    );
  }
  return <>{children}</>;
}
