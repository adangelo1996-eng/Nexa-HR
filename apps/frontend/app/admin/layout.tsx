"use client";

import type React from "react";
import { AdminSidebar } from "@/components/admin-sidebar";

export default function AdminLayout({
  children
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-slate-50">
      <div className="mx-auto flex min-h-screen max-w-7xl">
        <AdminSidebar />
        <div className="flex-1 overflow-y-auto px-6 py-6 lg:px-10 lg:py-8">
          {children}
        </div>
      </div>
    </main>
  );
}

