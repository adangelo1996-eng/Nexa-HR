import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  /* lib/ contiene stringhe di classi (es. form-field-styles) — senza questa voce Tailwind non le emette nel CSS. */
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-montserrat)",
          "Montserrat",
          "Inter",
          "system-ui",
          "sans-serif"
        ],
        synapse: [
          '"Golden Rooster"',
          "var(--font-synapse-wordmark)",
          "var(--font-montserrat)",
          "Montserrat",
          "Inter",
          "system-ui",
          "sans-serif"
        ]
      },
      colors: {
        /* Accento blu di Prussia / grigio — i token “gold” restano per compatibilità classi */
        synapse: {
          /* Sfondo/superficie dark: scala da Pantone 288 C (#002d72) — 50-884 Blu marine */
          bg: "#011528",
          "bg-light": "#f2f2f7",
          surface: "#052642",
          "surface-light": "#ffffff",
          gold: "#002d72",
          "gold-bright": "#6eb0e0",
          "gold-soft": "#003a8c",
          "gold-soft-dark": "#3d85b5",
          text: "#1c1c1e",
          muted: "#6e6e73"
        },
        bg: "#011528",
        card: "#052642",
        accent: "#002d72"
      },
      boxShadow: {
        soft: "0 10px 40px -20px rgba(58, 84, 102, 0.3)",
        "soft-light": "0 14px 40px -18px rgba(26, 31, 24, 0.1)"
      }
    }
  },
  plugins: []
};

export default config;
