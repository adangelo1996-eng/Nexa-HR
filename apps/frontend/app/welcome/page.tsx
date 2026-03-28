import { redirect } from "next/navigation";

export default function WelcomeRedirectPage(): never {
  redirect("/");
}
