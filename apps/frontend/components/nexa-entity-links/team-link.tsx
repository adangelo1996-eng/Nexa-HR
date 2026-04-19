"use client";

import type { JSX } from "react";
import type { Route } from "next";
import Link from "next/link";
import { getSessionUser, sessionCanUseAdminOrgDeepLinks, type SessionUser } from "@/lib/auth-session";

export type TeamLinkProps = {
  costCenterId: string;
  teamId: string;
  label: string;
  viewer?: SessionUser | null;
  className?: string;
};

export function TeamLink({
  costCenterId,
  teamId,
  label,
  viewer: viewerProp,
  className
}: TeamLinkProps): JSX.Element {
  const viewer = viewerProp ?? getSessionUser();
  const can = sessionCanUseAdminOrgDeepLinks(viewer);
  const href =
    `/admin/cost-centers?cc=${encodeURIComponent(costCenterId)}&team=${encodeURIComponent(teamId)}` as Route;
  const cn = className ?? "text-[var(--prom-gold)] hover:underline";
  if (!can) {
    return <span className={className ?? "text-[var(--prom-text)]"}>{label}</span>;
  }
  return (
    <Link href={href} className={cn} title={`Team in admin: ${label}`}>
      {label}
    </Link>
  );
}
