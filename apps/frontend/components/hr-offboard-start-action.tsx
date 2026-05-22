"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { startHrOffboarding } from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";

type Props = {
  userId: string;
  fullName: string;
  employmentState?: string;
  variant?: "button" | "link";
  className?: string;
};

export function HrOffboardStartAction(props: Props): React.JSX.Element | null {
  const { userId, fullName, employmentState, variant = "link", className } = props;
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (employmentState === "hr_onboarding") {
    return null;
  }

  if (employmentState === "offboarding") {
    return (
      <a
        href={`/hr/offboarding/wizard/${encodeURIComponent(userId)}?name=${encodeURIComponent(fullName)}`}
        className={
          className ??
          "inline-block text-xs font-medium text-[#002D72] underline-offset-2 hover:underline dark:text-sky-200"
        }
      >
        Apri wizard offboarding →
      </a>
    );
  }

  if (employmentState && employmentState !== "active") {
    return null;
  }

  async function onStart(): Promise<void> {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    try {
      await startHrOffboarding(token, userId);
      router.push(
        `/hr/offboarding/wizard/${encodeURIComponent(userId)}?name=${encodeURIComponent(fullName)}` as Route
      );
    } catch {
      setBusy(false);
    }
  }

  if (variant === "button") {
    return (
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void onStart()}>
        {busy ? "Avvio…" : "Avvia offboarding"}
      </Button>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void onStart()}
      className={
        className ??
        "text-xs font-medium text-rose-700 underline-offset-2 hover:underline disabled:opacity-60 dark:text-rose-300"
      }
    >
      {busy ? "Avvio…" : "Avvia offboarding"}
    </button>
  );
}
