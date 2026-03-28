"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { login } from "@/lib/api";
import { saveSession } from "@/lib/auth-session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type LoginPhase = "idle" | "submitting" | "redirecting";

/** Login: hero SYNAPSE-style + pulsante LOGIN che apre la card credenziali. */
export default function LoginForm(): React.JSX.Element {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<LoginPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [warmingUp, setWarmingUp] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  const busy = phase !== "idle";

  useEffect(() => {
    const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim() || "http://localhost:4000";
    const origin = base.replace(/\/+$/, "");
    const url = origin.endsWith("/api") ? origin.slice(0, -"/api".length) : origin;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    setWarmingUp(true);
    fetch(url, { method: "GET", signal: controller.signal })
      .catch(() => undefined)
      .finally(() => setWarmingUp(false));

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("open") === "1") setDialogOpen(true);
  }, []);

  useEffect(() => {
    if (!dialogOpen) return;
    const t = setTimeout(() => emailRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [dialogOpen]);

  useEffect(() => {
    if (!dialogOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setDialogOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dialogOpen]);

  useEffect(() => {
    if (dialogOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [dialogOpen]);

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
    <>
      <main className="relative flex min-h-[calc(100dvh-3.25rem)] flex-col items-center justify-center px-6 py-12 text-center">
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
          className="flex w-full max-w-4xl flex-col items-center"
        >
          <p className="mb-[clamp(12px,2vw,20px)] text-[0.65rem] font-medium uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            PEOPLE OPERATIONS · SVIZZERA
          </p>
          <h1
            className="mb-[clamp(28px,5vw,44px)] max-w-[20ch] px-[0.04em] font-synapse text-[clamp(3rem,14vw,7.5rem)] font-semibold uppercase leading-[0.92] tracking-[0.06em] text-synapse-text dark:text-[#f5f6fb]"
            style={{
              fontSynthesis: "none",
              textShadow:
                "0 0 40px rgba(255, 255, 255, 0.12), 0 0 80px rgba(255, 255, 255, 0.06)"
            }}
          >
            NEXA HR
          </h1>

          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex min-w-[min(240px,88vw)] items-center justify-center rounded-full border border-slate-300/90 bg-gradient-to-br from-white/95 to-slate-100/70 px-8 py-3.5 text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-slate-900 shadow-[0_12px_36px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-[16px] transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-slate-400/80 dark:border-white/28 dark:from-white/[0.22] dark:to-white/[0.06] dark:text-[#fafafa] dark:shadow-[0_12px_36px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.2)] dark:hover:border-white/40"
          >
            LOGIN
          </button>

          <Link
            href="/welcome"
            className="mt-7 text-[0.82rem] font-medium uppercase tracking-[0.06em] text-slate-600 underline-offset-4 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          >
            ← TORNA ALLA HOME NEXA HR
          </Link>
        </motion.div>
      </main>

      <AnimatePresence>
        {dialogOpen ? (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="nexa-login-title"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 px-5 py-8 backdrop-blur-[8px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setDialogOpen(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <Card className="border-white/22 bg-gradient-to-br from-white/[0.14] to-white/[0.05] shadow-[0_16px_48px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.14)] dark:border-white/22">
                <CardHeader>
                  <CardTitle id="nexa-login-title" className="font-synapse text-base uppercase tracking-[0.14em]">
                    ACCESSO
                  </CardTitle>
                  <CardDescription>
                    Usa la stessa email e password del progetto Supabase (come Plasticity), es.{" "}
                    <strong>admin@synapse.com</strong> e la password della suite. Senza Supabase sul backend vale la
                    password in modalità legacy (vedi README).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {warmingUp ? (
                    <p className="mb-3 text-xs text-synapse-muted dark:text-[#c8c8c8]">
                      Sto preparando il server… (se è in standby può richiedere qualche secondo)
                    </p>
                  ) : null}
                  <form onSubmit={onSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="nexa-email" className="mb-1.5 block text-[0.72rem] font-medium uppercase tracking-[0.14em] text-synapse-muted dark:text-[#c8c8c8]">
                        Email
                      </label>
                      <Input
                        ref={emailRef}
                        id="nexa-email"
                        type="email"
                        placeholder="email@azienda.ch"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        autoComplete="email"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="nexa-password" className="mb-1.5 block text-[0.72rem] font-medium uppercase tracking-[0.14em] text-synapse-muted dark:text-[#c8c8c8]">
                        Password
                      </label>
                      <Input
                        id="nexa-password"
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="current-password"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full rounded-full border border-white/35 bg-gradient-to-br from-white/28 to-white/10 px-4 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-md transition-opacity disabled:opacity-50 dark:border-white/35"
                    >
                      {phase === "redirecting"
                        ? "Reindirizzamento…"
                        : phase === "submitting"
                          ? "Accesso in corso…"
                          : "Entra"}
                    </button>
                  </form>
                  {error ? <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}
                  <button
                    type="button"
                    className="mt-4 w-full text-[0.75rem] font-medium uppercase tracking-[0.1em] text-slate-500 hover:text-slate-800 dark:text-slate-500 dark:hover:text-slate-200"
                    onClick={() => setDialogOpen(false)}
                  >
                    Chiudi
                  </button>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
