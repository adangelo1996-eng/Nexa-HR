"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";
import { saveSession } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function LoginPage(): React.JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await login(email, password);
      saveSession(session.token, session.user);
      router.replace("/");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Login non riuscito");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-slate-950 px-6">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
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
              {error ? <p className="text-sm text-rose-300">{error}</p> : null}
              <Button type="submit" disabled={loading} className="w-full" size="md" variant="primary">
                {loading ? "Accesso in corso..." : "Entra"}
              </Button>
            </form>
            <p className="mt-4 text-xs text-slate-500">
              Demo: admin@payday.ch / PasswordAdmin - manager.controllo@payday.local / ManagerPayday123! -
              dipendente.demo@payday.local / EmployeePayday123!
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </main>
  );
}
