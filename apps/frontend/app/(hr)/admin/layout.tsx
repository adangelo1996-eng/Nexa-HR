"use client";

import type React from "react";
import { AdminSidebar } from "@/components/admin-sidebar";

export default function AdminLayout({
  children
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <main className="min-h-[calc(100dvh-3.25rem)] text-synapse-text transition-colors dark:text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl">
        <AdminSidebar />
        <div className="flex-1 overflow-y-auto px-6 py-6 lg:px-10 lg:py-8">
          {children}
        </div>
      </div>
    </main>
  );
}

