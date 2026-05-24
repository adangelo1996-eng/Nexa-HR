"use client";

import type { Route } from "next";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { HrOnboardingBuddyPanel } from "@/components/hr-onboarding-buddy-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getToken } from "@/lib/auth-session";

export default function HrOnboardingBuddyPage(): React.JSX.Element {
  const router = useRouter();
  const params = useParams<{ userId: string }>();
  const search = useSearchParams();
  const userId = params.userId;
  const employeeName = search.get("name") ?? "Dipendente";

  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setToken(t);
  }, [router]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href="/hr-recap" className="text-[#002D72] underline-offset-2 hover:underline dark:text-sky-200">
          ← Recap HR
        </Link>
        <span className="text-synapse-muted">·</span>
        <Link
          href={`/employee/${encodeURIComponent(userId)}` as Route}
          className="text-[#002D72] underline-offset-2 hover:underline dark:text-sky-200"
        >
          Profilo dipendente
        </Link>
        <span className="text-synapse-muted">·</span>
        <Link
          href={`/hr/onboarding/wizard/${encodeURIComponent(userId)}?name=${encodeURIComponent(employeeName)}` as Route}
          className="text-[#002D72] underline-offset-2 hover:underline dark:text-sky-200"
        >
          Wizard onboarding
        </Link>
      </div>

      <Card className="border-[var(--card-border)]">
        <CardHeader>
          <CardTitle className="text-lg">Buddy onboarding</CardTitle>
          <CardDescription>
            Assegna o riassegna il buddy per {employeeName}, anche dopo la conclusione del wizard. I suggerimenti
            combinano regole HR e analisi AI su profili pseudonimizzati.
          </CardDescription>
        </CardHeader>
        <CardContent>{token ? <HrOnboardingBuddyPanel token={token} userId={userId} employeeName={employeeName} /> : null}</CardContent>
      </Card>
    </div>
  );
}
