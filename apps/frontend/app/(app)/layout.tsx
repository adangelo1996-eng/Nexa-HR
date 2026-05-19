import { AppPrecache } from "@/components/app-precache";
import { AppShell } from "@/components/app-shell";
import { NexaAsyncLoadingProvider } from "@/components/nexa-async-loading-provider";
import { NexaHrRouteChrome } from "@/components/nexa-hr-route-chrome";
import { SessionKeeper } from "@/components/session-keeper";

export default function AuthenticatedAppLayout({
  children
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <NexaAsyncLoadingProvider>
      <AppShell>
        <SessionKeeper />
        <AppPrecache />
        <NexaHrRouteChrome>{children}</NexaHrRouteChrome>
      </AppShell>
    </NexaAsyncLoadingProvider>
  );
}
