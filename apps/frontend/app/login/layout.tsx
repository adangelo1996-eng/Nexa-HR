import { Montserrat } from "next/font/google";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap"
});

export default function LoginLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return <div className={`${montserrat.className} nexa-login-shell`}>{children}</div>;
}
