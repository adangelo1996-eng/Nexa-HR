"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HebbHrChat } from "@/components/hebb-hr-chat";
import { fetchCurrentUser } from "@/lib/api";
import { clearSession, getToken, sessionCanAccessPayrollArea, type SessionUser } from "@/lib/auth-session";

export default function PayrollHebbPage(): React.JSX.Element {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setToken(t);
    void (async () => {
      try {
        const me = await fetchCurrentUser(t);
        if (!sessionCanAccessPayrollArea(me)) {
          router.replace("/");
          return;
        }
        setUser(me);
      } catch {
        clearSession();
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (loading || !token || !user) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <p className="text-slate-700 dark:text-slate-300">Caricamento Hebb HR…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Hebb HR</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Assistente payroll Italia · operatore: {user.fullName}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/payroll-calc" className="synapse-nav-link">
            Calcolo cedolino
          </Link>
          <Link href="/" className="synapse-nav-link">
            Dashboard
          </Link>
        </div>
      </header>
      <section className="card">
        <HebbHrChat token={token} />
      </section>
    </main>
  );
}
