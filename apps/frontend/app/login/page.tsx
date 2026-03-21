"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { login } from "@/lib/api";
import { saveSession } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type LoginPhase = "idle" | "submitting" | "redirecting";

export default function LoginPage(): React.JSX.Element {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<LoginPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const busy = phase !== "idle";

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
              Nexa HR — login con credenziali aziendali. I ruoli sono assegnati da admin.
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
              {error ? <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}
              <Button type="submit" disabled={busy} className="w-full" size="md" variant="primary">
                {phase === "redirecting"
                  ? "Reindirizzamento…"
                  : phase === "submitting"
                    ? "Accesso in corso…"
                    : "Entra"}
              </Button>
            </form>
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
