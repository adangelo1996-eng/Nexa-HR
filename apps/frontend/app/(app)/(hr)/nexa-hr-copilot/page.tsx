import { redirect } from "next/navigation";

/** NEXA HR Copilot deprecato — reindirizza all'hub Analytics. */
export default function NexaHrCopilotRedirectPage(): never {
  redirect("/analytics");
}
