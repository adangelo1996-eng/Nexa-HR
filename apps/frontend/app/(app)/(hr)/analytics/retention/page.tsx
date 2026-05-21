import { redirect } from "next/navigation";

export default function AnalyticsRetentionRedirectPage(): never {
  redirect("/analytics/advanced/retention");
}
