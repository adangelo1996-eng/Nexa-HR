"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { loginWithSupabaseAccessToken } from "@/lib/api";
import { saveSession } from "@/lib/auth-session";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Phase = "working" | "done" | "error";

export default function AuthCallbackPage(): React.JSX.Element {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("working");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run(): Promise<void> {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setPhase("error");
        setMessage("Supabase non configurato: imposta NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.");
        return;
      }

      const search = typeof window !== "undefined" ? window.location.search : "";
      const params = new URLSearchParams(search);
      const oauthError = params.get("error");
      const oauthDescription = params.get("error_description");
      if (oauthError) {
        setPhase("error");
        setMessage(
          oauthDescription?.replace(/\+/g, " ") ??
            `Accesso annullato o rifiutato (${oauthError}).`
        );
        return;
      }

      const code = params.get("code");
      try {
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            throw new Error(exchangeError.message);
          }
        }

        const {
          data: { session },
          error: sessionError
        } = await supabase.auth.getSession();
        if (sessionError) {
          throw new Error(sessionError.message);
        }
        if (!session?.access_token) {
          throw new Error("Sessione OAuth non disponibile. Riprova dal login.");
        }

        const appSession = await loginWithSupabaseAccessToken(session.access_token);
        if (cancelled) {
          return;
        }

        await supabase.auth.signOut();
        saveSession(appSession.token, appSession.user);
        setPhase("done");
        window.location.replace("/");
      } catch (e) {
        if (cancelled) {
          return;
        }
        setPhase("error");
        setMessage(e instanceof Error ? e.message : "Completamento accesso non riuscito.");
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase === "working") {
    return (
      <main className="flex min-h-[calc(100dvh-3.25rem)] items-center justify-center px-6 py-12">
        <div className="flex flex-col items-center gap-3" aria-live="polite" aria-busy="true">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-synapse-gold border-t-transparent dark:border-synapse-gold-bright"
            role="presentation"
          />
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            Completamento accesso con il provider…
          </p>
        </div>
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="flex min-h-[calc(100dvh-3.25rem)] items-center justify-center px-6 py-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Accesso non completato</CardTitle>
            <CardDescription>{message}</CardDescription>
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

  return (
    <main className="flex min-h-[calc(100dvh-3.25rem)] items-center justify-center px-6 py-12">
      <p className="text-sm text-slate-600 dark:text-slate-400">Reindirizzamento…</p>
    </main>
  );
}
