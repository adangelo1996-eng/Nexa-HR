"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Compatibilità bookmark: hub analisi unificato su `/analytics`. */
export default function AiHubRedirectPage(): null {
  const router = useRouter();
  useEffect(() => {
    router.replace("/analytics");
  }, [router]);
  return null;
}
