import "./globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { AppBrandBar } from "@/components/app-brand-bar";
import { ThemeProvider } from "@/components/theme-provider";

const synapseWordmark = localFont({
  src: "../fonts/golden-rooster.ttf",
  variable: "--font-synapse-wordmark",
  weight: "600",
  display: "swap"
});

const themeInitScript = `(function(){try{var k="nexa-hr-theme",t=localStorage.getItem(k),r=document.documentElement;if(t==="light")r.classList.remove("dark");else r.classList.add("dark");}catch(e){document.documentElement.classList.add("dark");}})();`;

export const metadata: Metadata = {
  title: "Nexa HR — Synapse",
  description: "Piattaforma enterprise HR con payroll svizzero"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <html lang="it" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${synapseWordmark.variable} antialiased`}>
        <ThemeProvider>
          <AppBrandBar />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
