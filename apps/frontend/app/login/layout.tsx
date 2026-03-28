export default function LoginLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return <div className="nexa-login-shell">{children}</div>;
}
