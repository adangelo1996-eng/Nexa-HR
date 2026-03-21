"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { login } from "@/lib/api";
import { saveSession } from "@/lib/auth-session";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function GoogleIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function MicrosoftIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg className={className} viewBox="0 0 21 21" aria-hidden="true">
      <path fill="#f25022" d="M1 1h9v9H1z" />
      <path fill="#00a4ef" d="M11 1h9v9h-9z" />
      <path fill="#7fba00" d="M1 11h9v9H1z" />
      <path fill="#ffb900" d="M11 11h9v9h-9z" />
    </svg>
  );
}

type LoginPhase = "idle" | "submitting" | "redirecting";

export default function LoginPage(): React.JSX.Element {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<LoginPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const busy = phase !== "idle";
  const oauthAvailable = getSupabaseBrowserClient() !== null;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setPhase("submitting");
    try {
      const session = await login(email, password);
      saveSession(session.token, session.user);
      setPhase("redirecting");
      window.location.assign("/");
    } catch (submissionError) {
      setPhase("idle");
      setError(submissionError instanceof Error ? submissionError.message : "Login non riuscito");
    }
  }

  async function onOAuth(provider: "google" | "azure"): Promise<void> {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }
    setError(null);
    setPhase("submitting");
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });
    if (oauthError) {
      setPhase("idle");
      setError(oauthError.message);
    }
  }

  return (
    <main className="relative flex min-h-[calc(100dvh-3.25rem)] items-center justify-center px-6 py-12">
      {busy ? (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/80 backdrop-blur-md dark:bg-slate-950/75"
          aria-live="polite"
          aria-busy="true"
        >
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-synapse-gold border-t-transparent dark:border-synapse-gold-bright"
            role="presentation"
          />
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {phase === "redirecting" ? "Reindirizzamento alla dashboard…" : "Accesso in corso…"}
          </p>
        </div>
      ) : null}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        <Card>
          <CardHeader>
            <CardTitle>Accesso area riservata</CardTitle>
            <CardDescription>
              Nexa HR — accesso con email aziendale, oppure Google o Microsoft se configurati. I ruoli restano
              assegnati da admin; l&apos;email OAuth deve coincidere con l&apos;utente in anagrafica.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <Input
                type="email"
                placeholder="email@azienda.ch"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
              <Button type="submit" disabled={busy} className="w-full" size="md" variant="primary">
                {phase === "redirecting"
                  ? "Reindirizzamento…"
                  : phase === "submitting"
                    ? "Accesso in corso…"
                    : "Entra"}
              </Button>
            </form>
            {error ? <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}
            {oauthAvailable ? (
              <div className="mt-6 space-y-3">
                <div className="relative flex items-center gap-3">
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    oppure
                  </span>
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    disabled={busy}
                    className="w-full gap-2"
                    onClick={() => void onOAuth("google")}
                  >
                    <GoogleIcon className="h-4 w-4 shrink-0" />
                    Google
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    disabled={busy}
                    className="w-full gap-2"
                    onClick={() => void onOAuth("azure")}
                  >
                    <MicrosoftIcon className="h-4 w-4 shrink-0" />
                    Microsoft
                  </Button>
                </div>
              </div>
            ) : null}
            <p className="mt-4 text-xs leading-relaxed text-slate-600 dark:text-slate-500">
              Account demo:{" "}
              <span className="text-slate-500 dark:text-slate-400">
                admin@payday.ch / AdminPayday123! · manager@payday.ch / ManagerPayday123! · employee@payday.ch /
                EmployeePayday123!
              </span>
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </main>
  );
}
