import { AppPrecache } from "@/components/app-precache";
import { AppShell } from "@/components/app-shell";

export default function AuthenticatedAppLayout({
  children
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <AppShell>
      <AppPrecache />
      {children}
    </AppShell>
  );
}
