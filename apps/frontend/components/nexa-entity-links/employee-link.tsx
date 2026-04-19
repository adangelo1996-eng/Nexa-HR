"use client";

import type { JSX } from "react";
import type { Route } from "next";
import Link from "next/link";
import { getSessionUser, sessionCanViewEmployeeProfile, type SessionUser } from "@/lib/auth-session";

export type EmployeeLinkProps = {
  userId: string;
  label: string;
  managerId?: string | null;
  /** Se passato, evita getSessionUser() ad ogni render */
  viewer?: SessionUser | null;
  className?: string;
};

export function EmployeeLink({ userId, label, managerId, viewer: viewerProp, className }: EmployeeLinkProps): JSX.Element {
  const viewer = viewerProp ?? getSessionUser();
  const can = sessionCanViewEmployeeProfile(viewer, { userId, managerId });
  const href = `/employee/${encodeURIComponent(userId)}` as Route;
  const cn = className ?? "text-[var(--prom-gold)] hover:underline";
  if (!can) {
    return <span className={className ?? "text-[var(--prom-text)]"}>{label}</span>;
  }
  return (
    <Link href={href} className={cn} title={`Apri scheda: ${label}`}>
      {label}
    </Link>
  );
}
