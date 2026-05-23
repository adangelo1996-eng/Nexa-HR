"use client";

import type { Route } from "next";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, KeyRound } from "lucide-react";
import { EffectivePermissionsPanel } from "@/components/effective-permissions-panel";
import { Button } from "@/components/ui/button";
import {
  fetchCurrentUser,
  fetchEmployeeCvProfile,
  fetchUserEffectivePermissions,
  type EmployeeCvProfileDto,
  type UserEffectivePermissionsDto
} from "@/lib/api";
import {
  clearSession,
  getToken,
  shouldClearSessionOnUnauthorizedApiError,
  type SessionUser
} from "@/lib/auth-session";

export default function EmployeeAutorizzazioniPage(): React.JSX.Element {
  const params = useParams();
  const router = useRouter();
  const userId = typeof params.userId === "string" ? params.userId : "";

  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<EmployeeCvProfileDto | null>(null);
  const [permissions, setPermissions] = useState<UserEffectivePermissionsDto | null>(null);
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
        const me = await fetchCurrentUser(t);
        if (cancelled) {
          return;
        }
        setSessionUser(me);
        const [cv, perms] = await Promise.all([
          fetchEmployeeCvProfile(t, userId),
          fetchUserEffectivePermissions(t, userId)
        ]);
        if (!cancelled) {
          setProfile(cv);
          setPermissions(perms);
        }
      } catch (e) {
        if (shouldClearSessionOnUnauthorizedApiError(e)) {
          clearSession();
          router.replace("/login");
          return;
        }
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Errore caricamento autorizzazioni";
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
        Caricamento autorizzazioni…
      </div>
    );
  }

  if (error || !profile || !permissions) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6 text-center">
        <p className="text-sm text-[var(--prom-muted)]">
          {error ?? "Autorizzazioni non disponibili per questo profilo."}
        </p>
        <Button type="button" variant="secondary" onClick={() => router.push(`/employee/${userId}` as Route)}>
          Torna al profilo
        </Button>
      </div>
    );
  }

  const fullName = profile.subject.fullName;
  const isSelf = profile.flags.isSelf;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="sm" className="gap-2" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          Indietro
        </Button>
        <Link
          href={`/employee/${userId}` as Route}
          className="text-xs text-[var(--prom-muted)] underline-offset-2 hover:text-[var(--prom-text)] hover:underline"
        >
          Profilo {fullName}
        </Link>
      </div>

      <header className="space-y-2">
        <div className="flex items-center gap-2 text-[var(--prom-gold)]">
          <KeyRound className="h-5 w-5" aria-hidden />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">Autorizzazioni</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--prom-text)]">
          {isSelf ? "Le tue autorizzazioni" : `Autorizzazioni — ${fullName}`}
        </h1>
        <p className="text-sm text-[var(--prom-muted)]">
          Visibilità nel portale Nexa HR e livello di modifica per area, derivate dal ruolo
          {permissions.overrides.length > 0 ? " e da eventuali override" : ""}.
          {sessionUser && !isSelf ? " Solo utenti autorizzati possono consultare questo riepilogo." : null}
        </p>
      </header>

      <EffectivePermissionsPanel payload={permissions} nexaCatalog={permissions.nexaCatalog} />
    </div>
  );
}
