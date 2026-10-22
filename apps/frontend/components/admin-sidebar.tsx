"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { adminStrings } from "@/app/(app)/(hr)/admin/strings";

interface AdminNavItem {
  href: Route;
  label: string;
}

const NAV_ITEMS: AdminNavItem[] = [
  { href: "/admin", label: adminStrings.sidebar.users },
  { href: "/admin/roles", label: adminStrings.sidebar.roles },
  { href: "/admin/cost-centers", label: adminStrings.sidebar.costCenters },
  { href: "/admin/dati-azienda" as Route, label: adminStrings.sidebar.companyProfile },
  { href: "/admin/pacchetto" as Route, label: adminStrings.sidebar.tenantPack },
  { href: "/admin/data-export" as Route, label: "Export Excel dipendenti" },
  { href: "/admin/data-import" as Route, label: "Import Excel dipendenti" },
  { href: "/admin/payslip-import" as Route, label: adminStrings.sidebar.payslipImport },
  { href: "/expenses/org" as Route, label: adminStrings.sidebar.expenseClaimsOrg }
];

/** Offset sotto l'header sticky AppShell (~56px) così la colonna admin resta visibile su mobile */
const SIDEBAR_STICKY_TOP = "top-14";

/** Su mobile: una sola riga orizzontale scrollabile — il contenuto resta a larghezza piena sotto. */
function AdminNavMobileStrip(): React.JSX.Element {
  const pathname = usePathname();
  return (
    <nav
      className={[
        "sticky z-20 flex w-full gap-2 overflow-x-auto border-b border-[color:var(--glass-border)]",
        "bg-[var(--glass-bg)]/95 px-3 py-2.5 backdrop-blur-md [scrollbar-width:thin]",
        SIDEBAR_STICKY_TOP
      ].join(" ")}
      aria-label="Sotto-sezioni amministrazione"
    >
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              isActive
                ? "bg-synapse-gold/20 text-synapse-text ring-1 ring-synapse-gold/35 dark:bg-white/[0.1] dark:text-white"
                : "border border-transparent text-synapse-muted hover:bg-black/[0.06] dark:text-[#b4c9dc]/90 dark:hover:bg-white/[0.08]"
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
      <Link
        href="/settings"
        className="shrink-0 whitespace-nowrap rounded-full border border-synapse-gold/25 px-3 py-1.5 text-xs font-semibold text-synapse-text transition-colors hover:bg-synapse-gold/15 dark:text-white"
      >
        Impostazioni
      </Link>
    </nav>
  );
}

export function AdminSidebar(): React.JSX.Element {
  const pathname = usePathname();

  return (
    <>
      <div className="w-full md:hidden">
        <AdminNavMobileStrip />
      </div>
      <aside
        className={[
          "sticky z-20 hidden shrink-0 flex-col border-r border-[color:var(--glass-border)] md:flex",
          "bg-[var(--glass-bg)] backdrop-blur-xl transition-[border-color,background] duration-300",
          "w-52 min-w-[13rem]",
          SIDEBAR_STICKY_TOP,
          "max-h-[calc(100dvh-4.25rem)] overflow-y-auto overscroll-contain",
          "px-2.5 py-4 sm:px-4 sm:py-6"
        ].join(" ")}
        aria-label="Sotto-sezioni amministrazione"
      >
        <div className="mb-5 shrink-0 px-1 sm:mb-8 sm:px-2">
          <p
            className="font-synapse text-xs font-semibold tracking-tight text-synapse-text sm:text-sm dark:text-white"
            style={{ fontSynthesis: "none" }}
          >
            Nexa HR
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-500 sm:text-xs">
            admin
          </p>
          <p className="mt-1 text-[11px] leading-snug text-slate-600 dark:text-slate-300 sm:text-sm">
            Area amministrazione
          </p>
        </div>
        <nav className="space-y-0.5 text-[13px] sm:space-y-1 sm:text-sm">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex items-center rounded-lg px-2 py-2 transition-colors sm:px-3",
                  isActive
                    ? "bg-synapse-gold/15 text-synapse-text ring-1 ring-synapse-gold/30 dark:bg-white/[0.08] dark:text-white dark:ring-synapse-gold-bright/35"
                    : "text-synapse-muted hover:bg-black/[0.04] hover:text-synapse-text dark:text-[#b4c9dc]/90 dark:hover:bg-white/[0.06] dark:hover:text-white"
                ].join(" ")}
              >
                <span className="leading-tight">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 border-t border-[color:var(--glass-border)] pt-3">
          <Link
            href="/settings"
            className={[
              "flex items-center rounded-lg px-2 py-2 text-[13px] font-semibold transition-colors sm:px-3 sm:text-sm",
              pathname === "/settings"
                ? "bg-synapse-gold/15 text-synapse-text ring-1 ring-synapse-gold/30 dark:bg-white/[0.08] dark:text-white"
                : "text-synapse-muted hover:bg-black/[0.04] hover:text-synapse-text dark:text-[#b4c9dc]/90 dark:hover:bg-white/[0.06] dark:hover:text-white"
            ].join(" ")}
          >
            Impostazioni
          </Link>
        </div>
      </aside>
    </>
  );
}
