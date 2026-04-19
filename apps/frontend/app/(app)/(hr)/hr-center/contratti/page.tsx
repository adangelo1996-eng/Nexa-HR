import { redirect } from "next/navigation";

/** La sottosezione «Contratti LLM» è stata rimossa: flusso unificato in Centro HR. */
export default function HrCenterContrattiRedirectPage(): never {
  redirect("/hr-center/analisi");
}
