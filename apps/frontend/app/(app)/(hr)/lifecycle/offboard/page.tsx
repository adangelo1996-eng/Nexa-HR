"use client";

import { useState } from "react";
import { submitLifecycleOffboard } from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";

const DEFAULT_CHECKLIST = {
  revoca_accessi: false,
  payroll_finale: false,
  hardware: false
};

export default function OffboardPage(): React.JSX.Element {
  const [userId, setUserId] = useState("");
  const [checklist, setChecklist] = useState(DEFAULT_CHECKLIST);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(): Promise<void> {
    const token = getToken();
    if (!token || !userId.trim()) {
      return;
    }
    const res = (await submitLifecycleOffboard(token, userId.trim(), checklist)) as { accessDisabled?: boolean };
    setMsg(res.accessDisabled ? "Offboarding completato, accessi revocati lato email." : "Checklist aggiornata.");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--prom-text)]">Offboarding</h1>
      <input
        placeholder="userId dipendente"
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        className="w-full max-w-md rounded border border-[var(--prom-line)] bg-transparent px-3 py-2 text-sm"
      />
      <ul className="space-y-2 text-sm text-[var(--prom-text)]">
        {Object.keys(checklist).map((k) => (
          <li key={k}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={checklist[k as keyof typeof checklist]}
                onChange={(e) => setChecklist((c) => ({ ...c, [k]: e.target.checked }))}
              />
              {k}
            </label>
          </li>
        ))}
      </ul>
      <Button type="button" onClick={() => void submit()}>
        Salva
      </Button>
      {msg ? <p className="text-sm text-[var(--prom-muted)]">{msg}</p> : null}
    </div>
  );
}
