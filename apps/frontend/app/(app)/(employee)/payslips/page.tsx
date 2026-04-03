"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadPayslipPdf, fetchCurrentUser, fetchPayslips, markPayslipReadApi, type Payslip } from "@/lib/api";
import { getToken, getSessionUser, type SessionUser } from "@/lib/auth-session";
import { payslipDisplayCurrency } from "@/lib/nexa-swiss-payroll-flag";

export default function PayslipsPage(): React.JSX.Element {
  const [items, setItems] = useState<Payslip[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [month, setMonth] = useState<string>("");
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      return;
    }
    setLoading(true);
    try {
      const me = await fetchCurrentUser(token).catch(() => getSessionUser() as SessionUser);
      setUser(me ?? getSessionUser());
      const list = await fetchPayslips(token, { months: 12 });
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return items.filter((p) => {
      const [y, m] = p.period.split("-");
      if (year && y !== year) {
        return false;
      }
      if (month && m !== month.padStart(2, "0") && m !== month) {
        return false;
      }
      return true;
    });
  }, [items, year, month]);

  async function onDownload(p: Payslip): Promise<void> {
    const token = getToken();
    if (!token || !user) {
      return;
    }
    await downloadPayslipPdf(token, p.userId, p.period);
    if (p.isNew) {
      await markPayslipReadApi(token, p.id);
      setItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, isNew: false } : x)));
    }
  }

  const payslipCurrency = payslipDisplayCurrency(user?.jurisdiction);

  const years = useMemo(() => {
    const ys = new Set(items.map((p) => p.period.slice(0, 4)));
    ys.add(String(new Date().getFullYear()));
    return [...ys].sort((a, b) => b.localeCompare(a));
  }, [items]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-[var(--prom-text)]">Cedolini</h1>
        <p className="text-sm text-[var(--prom-muted)]">Ultimi 12 mesi</p>
      </header>
      <div className="flex flex-wrap gap-3">
        <label className="text-sm text-[var(--prom-muted)]">
          Anno
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="ml-2 rounded-lg border border-[var(--prom-line-strong)] bg-transparent px-2 py-1 text-[var(--prom-text)]"
          >
            <option value="">Tutti</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-[var(--prom-muted)]">
          Mese
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="ml-2 rounded-lg border border-[var(--prom-line-strong)] bg-transparent px-2 py-1 text-[var(--prom-text)]"
          >
            <option value="">Tutti</option>
            {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? <p className="text-sm text-[var(--prom-muted)]">Caricamento…</p> : null}

      <ul className="space-y-2">
        {filtered.length === 0 ? (
          <li className="text-sm text-[var(--prom-muted)]">Nessun cedolino.</li>
        ) : (
          filtered.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--prom-line)] px-4 py-3"
            >
              <div>
                <span className="font-medium text-[var(--prom-text)]">{p.period}</span>
                {p.isNew ? (
                  <span className="ml-2 rounded bg-rose-600/90 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
                    Nuovo
                  </span>
                ) : null}
                <p className="text-xs text-[var(--prom-muted)]">
                  Netto: {payslipCurrency} {p.netSalary?.toFixed?.(2) ?? p.netSalary}
                </p>
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={() => void onDownload(p)} className="gap-2">
                <FileDown className="h-4 w-4" />
                PDF
              </Button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
