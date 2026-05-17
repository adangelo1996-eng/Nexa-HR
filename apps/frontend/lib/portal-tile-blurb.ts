import type { Route } from "next";
import { PORTAL_TILES } from "@/lib/portal-mappa";

/** Testo breve per tile mappa/hub da definizione portale. */
export function portalBlurbForHref(href: Route | string): string {
  const key = String(href);
  return PORTAL_TILES.find((t) => String(t.href) === key)?.blurb ?? "";
}
