"use client";

import { useEffect, useState } from "react";
import { fetchUsers } from "@/lib/api";
import { getToken } from "@/lib/auth-session";

export default function CompensationBenchPage(): React.JSX.Element {
  const [internal, setInternal] = useState<number | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      return;
    }
    void (async (): Promise<void> => {
      const users = await fetchUsers(token);
      const u = users[0];
      setInternal(u ? Number(u.baseSalaryMonthly) || 3500 : null);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--prom-text)]">Benchmark retribuzione</h1>
      <p className="text-sm text-[var(--prom-muted)]">
        Nexa HR è calibrato sul payroll Italia. Un benchmark di mercato esterno (fonti terze, settore, area
        geografica) non è ancora integrato: usare i dati RAL da anagrafica e il budget personale per il confronto
        interno.
      </p>
      {internal != null ? (
        <p className="text-[var(--prom-text)]">
          Esempio da anagrafica (primo utente in elenco): stipendio base mensile indicativo{" "}
          <strong>{internal} EUR</strong>.
        </p>
      ) : null}
    </div>
  );
}
