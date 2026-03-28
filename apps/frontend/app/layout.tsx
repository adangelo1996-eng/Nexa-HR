import "./globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { Montserrat } from "next/font/google";
import { ConditionalBrandBar } from "@/components/conditional-brand-bar";
import { ThemeProvider } from "@/components/theme-provider";

const synapseWordmark = localFont({
  src: "../fonts/golden-rooster.ttf",
  variable: "--font-synapse-wordmark",
  weight: "600",
  display: "swap"
});

/** Stesso ordine di Plasticity shared.css: display → Montserrat (mai monospace di fallback). */
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap"
});

const themeInitScript = `(function(){try{var k="nexa-hr-theme",t=localStorage.getItem(k),r=document.documentElement;if(t==="light")r.classList.remove("dark");else r.classList.add("dark");}catch(e){document.documentElement.classList.add("dark");}})();`;

export const metadata: Metadata = {
  title: "Nexa HR — Synapse",
  description: "Piattaforma enterprise HR — people operations"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <html lang="it" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          href="/fonts/golden-rooster.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${synapseWordmark.variable} ${montserrat.variable} antialiased`}>
        <ThemeProvider>
          <ConditionalBrandBar />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
