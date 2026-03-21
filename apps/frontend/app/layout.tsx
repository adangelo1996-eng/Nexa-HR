import "./globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { AppBrandBar } from "@/components/app-brand-bar";

const synapseWordmark = localFont({
  src: "../fonts/golden-rooster.ttf",
  variable: "--font-synapse-wordmark",
  weight: "600",
  display: "swap"
});

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
    <html lang="it">
      <body className={`${synapseWordmark.variable} bg-bg text-slate-100 antialiased`}>
        <AppBrandBar />
        {children}
      </body>
    </html>
  );
}

