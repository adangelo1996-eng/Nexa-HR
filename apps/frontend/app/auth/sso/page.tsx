"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { saveSession } from "@/lib/auth-session";
import { loginWithSynapseSso } from "@/lib/api";
import { prefetchWorkCalendarInBackground } from "@/lib/work-calendar-prefetch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function SsoFallback(): React.JSX.Element {
  return (
    <main className="flex min-h-[calc(100dvh-3.25rem)] items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Accesso federato in corso</CardTitle>
          <CardDescription>Sto verificando il token dal Central Hub...</CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}

function AuthSsoContent(): React.JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(true);

  const nextPath = useMemo(() => {
    const next = params.get("next");
    return next && next.startsWith("/") ? next : "/";
  }, [params]);

  useEffect(() => {
    const token = params.get("synapse_sso") ?? "";
    if (!token) {
      setError("Token SSO mancante");
      setWorking(false);
      return;
    }

    loginWithSynapseSso(token)
      .then((session) => {
        saveSession(session.token, session.user);
        prefetchWorkCalendarInBackground(session.token);
        window.location.replace(nextPath);
      })
      .catch((ssoError) => {
        setError(ssoError instanceof Error ? ssoError.message : "Accesso SSO non riuscito");
        setWorking(false);
      });
  }, [params, nextPath]);

  if (working) {
    return <SsoFallback />;
  }

  return (
    <main className="flex min-h-[calc(100dvh-3.25rem)] items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>SSO non riuscito</CardTitle>
          <CardDescription>{error ?? "Non e' stato possibile completare l'accesso federato."}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="primary" className="w-full" onClick={() => router.push("/login")}>
            Torna al login
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

export default function AuthSsoPage(): React.JSX.Element {
  return (
    <Suspense fallback={<SsoFallback />}>
      <AuthSsoContent />
    </Suspense>
  );
}
