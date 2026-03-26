"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AuthCallbackPage(): React.JSX.Element {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login");
  }, []);

  return (
    <main className="flex min-h-[calc(100dvh-3.25rem)] items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>SSO disabilitato</CardTitle>
          <CardDescription>
            L&apos;accesso con provider esterni (Google/Microsoft) non è disponibile. Usa le credenziali inviate
            dall&apos;amministratore.
          </CardDescription>
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
