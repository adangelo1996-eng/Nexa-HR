"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchEmployeeCvProfile } from "@/lib/api";
import { getToken, shouldClearSessionOnUnauthorizedApiError } from "@/lib/auth-session";

/** Verifica accesso a `/employee/:userId` tramite API (self, HR, manager, team lead). */
export function EmployeeRecapAccessGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const router = useRouter();
  const params = useParams();
  const userId = typeof params.userId === "string" ? params.userId : "";
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token || !userId) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    void fetchEmployeeCvProfile(token, userId)
      .then(() => {
        if (!cancelled) {
          setReady(true);
        }
      })
      .catch((e) => {
        if (cancelled) {
          return;
        }
        if (shouldClearSessionOnUnauthorizedApiError(e)) {
          router.replace("/login");
        } else {
          router.replace("/");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router, userId]);

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--prom-muted)]">
        Verifica accesso…
      </div>
    );
  }
  return <>{children}</>;
}
