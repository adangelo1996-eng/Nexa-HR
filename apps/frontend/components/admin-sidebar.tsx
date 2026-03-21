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
  { href: "/admin/cost-centers", label: adminStrings.sidebar.costCenters }
];

export function AdminSidebar(): React.JSX.Element {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen flex-col border-r px-4 py-6 backdrop-blur-xl transition-colors duration-300 border-slate-200/80 bg-white/75 dark:border-slate-800/70 dark:bg-slate-950/65">
      <div className="mb-8 px-2">
        <p
          className="font-synapse text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-200"
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
                  ? "bg-cyan-100/90 text-slate-900 dark:bg-slate-800/90 dark:text-slate-50"
                  : "text-slate-600 hover:bg-slate-100/90 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900/80 dark:hover:text-slate-100"
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
