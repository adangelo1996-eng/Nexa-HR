"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PersonnelBudgetAccessGate } from "@/components/personnel-budget-access-gate";

const TABS: { href: Route; label: string }[] = [
  { href: "/personnel-budget", label: "Mensile" },
  { href: "/personnel-budget/annual", label: "Annuale" },
  { href: "/personnel-budget/forecast", label: "Forecast" },
  { href: "/personnel-budget/analysis", label: "Analysis" }
];

export default function PersonnelBudgetSectionLayout({
  children
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const pathname = usePathname();
  return (
    <PersonnelBudgetAccessGate>
      <div className="space-y-6">
      <nav
        className="flex flex-wrap gap-2 border-b border-[var(--prom-line)] pb-3"
        aria-label="Sezioni budget personale"
      >
        {TABS.map((t) => {
          const active =
            t.href === "/personnel-budget"
              ? pathname === "/personnel-budget"
              : pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-[color-mix(in_srgb,var(--prom-gold)_22%,transparent)] text-[var(--prom-text)]"
                  : "text-[var(--prom-muted)] hover:bg-[color-mix(in_srgb,var(--prom-surface-soft)_80%,transparent)] hover:text-[var(--prom-text)]"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
    </PersonnelBudgetAccessGate>
  );
}
