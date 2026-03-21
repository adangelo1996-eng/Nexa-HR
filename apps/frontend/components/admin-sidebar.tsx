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
    <aside className="flex h-screen flex-col border-r border-slate-800/70 bg-slate-950/70 px-4 py-6 backdrop-blur-xl">
      <div className="mb-8 px-2">
        <p
          className="font-synapse text-sm font-semibold tracking-tight text-slate-200"
          style={{ fontSynthesis: "none" }}
        >
          Nexa HR
        </p>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">admin</p>
        <p className="mt-1 text-sm text-slate-300">Area amministrazione</p>
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
                  ? "bg-slate-800/80 text-slate-50"
                  : "text-slate-400 hover:bg-slate-900/80 hover:text-slate-100"
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

