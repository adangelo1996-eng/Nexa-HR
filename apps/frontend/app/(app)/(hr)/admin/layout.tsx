"use client";

import type React from "react";
import { AdminAccessGate } from "@/components/admin-access-gate";
import { AdminSidebar } from "@/components/admin-sidebar";

export default function AdminLayout({
  children
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <AdminAccessGate>
      <div
        className="min-h-0 text-synapse-text transition-colors dark:text-white"
        role="region"
        aria-label="Area amministrazione"
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col items-stretch gap-0 md:flex-row md:items-start">
          <AdminSidebar />
          <div className="min-w-0 flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:px-10 lg:py-8">
            {children}
          </div>
        </div>
      </div>
    </AdminAccessGate>
  );
}

