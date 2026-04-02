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
  { href: "/settings", label: "Impostazioni" }
];

/** Offset sotto l'header sticky AppShell (~56px) così la colonna admin resta visibile su mobile */
const SIDEBAR_STICKY_TOP = "top-14";

export function AdminSidebar(): React.JSX.Element {
  const pathname = usePathname();

  return (
    <aside
      className={[
        "sticky z-20 flex shrink-0 flex-col border-r border-[color:var(--glass-border)]",
        "bg-[var(--glass-bg)] backdrop-blur-xl transition-[border-color,background] duration-300",
        /* Larghezza fissa: su mobile il menu resta leggibile e non collassa nel flex */
        "w-[min(42vw,13rem)] min-w-[10.5rem] sm:w-52 sm:min-w-[13rem]",
        SIDEBAR_STICKY_TOP,
        /* Altezza massima viewport sotto header: scroll interno se serve, senza sparire col page scroll */
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
                  : "text-synapse-muted hover:bg-black/[0.04] hover:text-synapse-text dark:text-[#c8c8c8]/90 dark:hover:bg-white/[0.06] dark:hover:text-white"
              ].join(" ")}
            >
              <span className="leading-tight">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
