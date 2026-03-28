"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { login } from "@/lib/api";
import { saveSession } from "@/lib/auth-session";

type LoginPhase = "idle" | "submitting" | "redirecting";

/**
 * Pagina accesso allineata a Plasticity (login.html): topbar hubline, hero mega titolo, LOGIN → modale vetro.
 */
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
      <header
        className="sticky top-0 z-[60] border-b border-white/[0.14] shadow-[0_14px_32px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-md backdrop-saturate-[1.2]"
        style={{
          background: "linear-gradient(165deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.05))"
        }}
      >
        <div className="mx-auto flex min-h-16 w-[min(1280px,95vw)] items-center px-4 sm:px-5">
          <div
            className="inline-flex items-baseline [mix-blend-mode:normal]"
            aria-label="SYNAPSE NEXA HR"
          >
            <span
              className="font-synapse text-[clamp(1.05rem,2.2vw,1.35rem)] font-semibold uppercase leading-none tracking-[0.08em] text-white"
              style={{ fontSynthesis: "none", fontFamily: "var(--font-synapse-wordmark), Montserrat, system-ui, sans-serif" }}
            >
              SYNAPSE
            </span>
            <span className="mx-[0.2em] font-sans text-[clamp(0.95rem,1.8vw,1.15rem)] font-semibold text-white" aria-hidden>
              {" - "}
            </span>
            <span
              className="font-sans text-[clamp(0.78rem,1.5vw,0.95rem)] font-semibold uppercase leading-none tracking-[0.12em] text-[#94a3b8]"
              style={{ fontSynthesis: "none" }}
            >
              NEXA HR
            </span>
          </div>
        </div>
      </header>

      <div className="relative flex flex-1 flex-col items-center justify-center px-[18px] py-12 text-center [min-height:calc(100dvh-4rem)] [padding-top:clamp(24px,5vw,56px)] [padding-bottom:48px]">
        {busy ? (
          <div
            className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-md"
            aria-live="polite"
            aria-busy="true"
          >
            <div
              className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white"
              role="presentation"
            />
            <p className="text-sm font-medium text-white/90">
              {phase === "redirecting" ? "REINDIRIZZAMENTO…" : "ACCESSO IN CORSO…"}
            </p>
          </div>
        ) : null}

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="flex w-full max-w-5xl flex-col items-center"
        >
          <p className="m-0 mb-[clamp(12px,2vw,20px)] text-[clamp(0.62rem,1.4vw,0.72rem)] font-medium uppercase tracking-[0.2em] text-white/50">
            PEOPLE OPERATIONS
          </p>
          <h1
            className="m-0 mb-[clamp(28px,5vw,44px)] px-[0.04em] font-synapse text-[clamp(3rem,14vw,7.5rem)] font-semibold uppercase leading-[0.92] tracking-[0.06em] text-[#f5f6fb]"
            style={{
              fontSynthesis: "none",
              fontFamily: "var(--font-synapse-wordmark), Montserrat, system-ui, sans-serif",
              textShadow: "0 0 40px rgba(255, 255, 255, 0.12), 0 0 80px rgba(255, 255, 255, 0.06)"
            }}
          >
            NEXA HR
          </h1>

          <button
            type="button"
            id="btn-open-login"
            onClick={() => setDialogOpen(true)}
            className="inline-flex min-w-[min(240px,88vw)] cursor-pointer items-center justify-center rounded-full border border-white/28 bg-gradient-to-br from-white/[0.22] to-white/[0.06] px-8 py-3.5 text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-[#fafafa] shadow-[0_12px_36px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.2)] backdrop-blur-[16px] transition-[transform,border-color] duration-[250ms] ease-out hover:-translate-y-0.5 hover:border-white/[0.42]"
          >
            LOGIN
          </button>
        </motion.div>
      </div>

      <AnimatePresence>
        {dialogOpen ? (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="nexa-login-title"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-5 backdrop-blur-[8px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setDialogOpen(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-[400px] rounded-[18px] border border-white/22 bg-gradient-to-br from-white/[0.14] to-white/[0.05] p-[clamp(22px,4vw,32px)] shadow-[0_16px_48px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-[18px]"
              onClick={(e) => e.stopPropagation()}
            >
              <h2
                id="nexa-login-title"
                className="m-0 mb-1.5 font-synapse text-[1.1rem] font-semibold uppercase tracking-[0.14em] text-white"
              >
                ACCESSO
              </h2>
              <p className="lead m-0 mb-5 text-[0.88rem] leading-relaxed text-[#c8c8c8]">
                Stesso account Supabase delle altre app (es. <strong className="text-white">admin@synapse.com</strong>).
              </p>
              {warmingUp ? (
                <p className="mb-3 text-[0.85rem] text-[#c8c8c8]">Sto preparando il server… (standby Render)</p>
              ) : null}
              <form onSubmit={onSubmit}>
                <label htmlFor="nexa-email" className="mb-1.5 block text-[0.72rem] uppercase tracking-[0.14em] text-[#c8c8c8]">
                  EMAIL
                </label>
                <input
                  ref={emailRef}
                  id="nexa-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@synapse.com"
                  className="mb-4 w-full rounded-lg border border-white/14 bg-black/35 px-3.5 py-3 text-[0.95rem] text-white placeholder:text-white/40 focus:border-white/45 focus:outline-none"
                />

                <label htmlFor="nexa-password" className="mb-1.5 block text-[0.72rem] uppercase tracking-[0.14em] text-[#c8c8c8]">
                  PASSWORD
                </label>
                <input
                  id="nexa-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mb-4 w-full rounded-lg border border-white/14 bg-black/35 px-3.5 py-3 text-[0.95rem] text-white placeholder:text-white/40 focus:border-white/45 focus:outline-none"
                />

                <button
                  type="submit"
                  disabled={busy}
                  className="mt-2 w-full cursor-pointer rounded-full border border-white/35 bg-gradient-to-br from-white/28 to-white/10 px-4 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-[10px] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {phase === "redirecting"
                    ? "REINDIRIZZAMENTO…"
                    : phase === "submitting"
                      ? "ACCESSO IN CORSO…"
                      : "ENTRA"}
                </button>
              </form>
              {error ? <p className="mt-3 text-[0.85rem] text-rose-400">{error}</p> : null}
              <button
                type="button"
                className="mt-3.5 w-full cursor-pointer border-none bg-transparent p-2 text-[0.75rem] font-medium uppercase tracking-[0.1em] text-white/55 hover:text-white/90"
                onClick={() => setDialogOpen(false)}
              >
                CHIUDI
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
