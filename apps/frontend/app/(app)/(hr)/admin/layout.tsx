"use client";

import type React from "react";
import { AdminSidebar } from "@/components/admin-sidebar";

export default function AdminLayout({
  children
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      className="min-h-[calc(100dvh-3.25rem)] text-synapse-text transition-colors dark:text-white"
      role="region"
      aria-label="Area amministrazione"
    >
      {/* flex-row su tutti i breakpoint: menu admin a sinistra sempre visibile; sticky in AdminSidebar */}
      <div className="mx-auto flex w-full max-w-7xl flex-row items-start gap-0">
        <AdminSidebar />
        <div className="min-w-0 flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:px-10 lg:py-8">
          {children}
        </div>
      </div>
    </div>
  );
}

