"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { adminStrings } from "@/app/admin/strings";

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

export function AdminSidebar(): React.JSX.Element {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen flex-col border-r border-[color:var(--glass-border)] bg-[var(--glass-bg)] px-4 py-6 backdrop-blur-xl transition-[border-color,background] duration-300">
      <div className="mb-8 px-2">
        <p
          className="font-synapse text-sm font-semibold tracking-tight text-synapse-text dark:text-white"
          style={{ fontSynthesis: "none" }}
        >
          Nexa HR
        </p>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-500">admin</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Area amministrazione</p>
      </div>
      <nav className="space-y-1 text-sm">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex items-center rounded-lg px-3 py-2 transition-colors",
                isActive
                  ? "bg-synapse-gold/15 text-synapse-text ring-1 ring-synapse-gold/30 dark:bg-white/[0.08] dark:text-white dark:ring-synapse-gold-bright/35"
                  : "text-synapse-muted hover:bg-black/[0.04] hover:text-synapse-text dark:text-[#c8c8c8]/90 dark:hover:bg-white/[0.06] dark:hover:text-white"
              ].join(" ")}
            >
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
