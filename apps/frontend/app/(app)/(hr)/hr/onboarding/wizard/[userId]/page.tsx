"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { HrOnboardingWizardPanel } from "@/components/hr-onboarding-wizard-panel";
import { getToken } from "@/lib/auth-session";

export default function HrOnboardingWizardPage(): React.JSX.Element {
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
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href="/hr-recap" className="text-[#002D72] underline-offset-2 hover:underline dark:text-sky-200">
          ← Recap HR
        </Link>
        <span className="text-synapse-muted">·</span>
        <Link
          href="/recruiting/onboarding"
          className="text-[#002D72] underline-offset-2 hover:underline dark:text-sky-200"
        >
          Onboarding candidati
        </Link>
      </div>
      {token ? <HrOnboardingWizardPanel token={token} userId={userId} employeeName={employeeName} /> : null}
    </div>
  );
}
