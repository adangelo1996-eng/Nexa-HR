"use client";

import { usePathname } from "next/navigation";
import { AppBrandBar } from "@/components/app-brand-bar";

/** Su /login la shell replica Plasticity (header interno); nascondiamo la barra globale. */
export function ConditionalBrandBar(): React.JSX.Element | null {
  const pathname = usePathname();
  if (pathname === "/login") return null;
  return <AppBrandBar />;
}
