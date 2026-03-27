import { redirect } from "next/navigation";
import LoginForm from "./login-form";

/** Variabili hub lette a runtime su Render — altrimenti il prerender cache-a il form senza redirect SSO. */
export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ local?: string }>;
};

function hubOriginFromEnv(): string {
  const raw =
    process.env.CENTRAL_HUB_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_CENTRAL_HUB_ORIGIN?.trim() ||
    "";
  return raw.replace(/\/$/, "");
}

/**
 * Senza ?local=1, reindirizza sempre al handoff dell’hub: così non si usa la password Nexa se già loggati sul Central Hub.
 */
export default async function LoginPage({ searchParams }: LoginPageProps): Promise<React.JSX.Element> {
  const params = await searchParams;
  const hub = hubOriginFromEnv();

  if (hub && params.local !== "1") {
    const handoff = new URL("/api/auth/handoff", hub);
    handoff.searchParams.set("app", "nexa");
    handoff.searchParams.set("next", "/");
    // External URL: Next typed routes narrow `redirect` to internal `Route`; handoff is another origin.
    redirect(handoff.toString() as Parameters<typeof redirect>[0]);
  }

  return <LoginForm />;
}
