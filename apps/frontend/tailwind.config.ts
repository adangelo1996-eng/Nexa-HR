import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        synapse: ["var(--font-synapse-wordmark)", "Montserrat", "Inter", "system-ui", "sans-serif"]
      },
      colors: {
        /* Accento blu di Prussia / grigio — i token “gold” restano per compatibilità classi */
        synapse: {
          bg: "#0b0b0b",
          "bg-light": "#ececec",
          surface: "#141414",
          "surface-light": "#ffffff",
          gold: "#3a5466",
          "gold-bright": "#5d7a8f",
          "gold-soft": "#2a3f4d",
          "gold-soft-dark": "#4a6578",
          text: "#1a1f18",
          muted: "#4d5248"
        },
        bg: "#0b0b0b",
        card: "#141414",
        accent: "#3a5466"
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
