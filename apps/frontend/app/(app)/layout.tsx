import { AppShell } from "@/components/app-shell";

export default function AuthenticatedAppLayout({
  children
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <AppShell>{children}</AppShell>;
}
