"use client";

import type { Route } from "next";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { EmployeeCvProfile } from "@/components/employee-cv-profile";
import { Button } from "@/components/ui/button";
import { fetchCurrentUser, fetchEmployeeCvProfile, type EmployeeCvProfileDto } from "@/lib/api";
import {
  clearSession,
  getToken,
  shouldClearSessionOnUnauthorizedApiError,
  type SessionUser
} from "@/lib/auth-session";

export default function EmployeeProfilePage(): React.JSX.Element {
  const params = useParams();
  const router = useRouter();
  const userId = typeof params.userId === "string" ? params.userId : "";

  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<EmployeeCvProfileDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    if (!userId) {
      setError("Profilo non valido.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [me, cv] = await Promise.all([fetchCurrentUser(t), fetchEmployeeCvProfile(t, userId)]);
        if (cancelled) {
          return;
        }
        setSessionUser(me);
        setProfile(cv);
      } catch (e) {
        if (shouldClearSessionOnUnauthorizedApiError(e)) {
          clearSession();
          router.replace("/login");
          return;
        }
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Errore caricamento profilo";
          setError(msg);
          if (/403|non autorizzato|negato/i.test(msg)) {
            router.replace("/");
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, userId]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-[var(--prom-muted)]">
        Caricamento profilo…
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6 text-center">
        <p className="text-sm text-[var(--prom-muted)]">
          {error ?? "Profilo non trovato o non visibile con i tuoi permessi."}
        </p>
        <Button type="button" variant="secondary" onClick={() => router.push("/org-chart" as Route)}>
          Vai all&apos;organigramma
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="sm" className="gap-2" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          Indietro
        </Button>
      </div>
      <EmployeeCvProfile profile={profile} viewer={sessionUser} userId={userId} />
    </div>
  );
}
