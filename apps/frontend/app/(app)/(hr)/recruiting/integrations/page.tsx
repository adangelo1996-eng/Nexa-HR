import { redirect } from "next/navigation";

/** Integrazioni LinkedIn in sviluppo — torna al recruiting. */
export default function RecruitingIntegrationsRedirectPage(): never {
  redirect("/recruiting");
}
