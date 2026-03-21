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
        /* promethys-site / synapse-site-shared.css */
        synapse: {
          bg: "#0b0b0b",
          "bg-light": "#ececec",
          surface: "#141414",
          "surface-light": "#ffffff",
          gold: "#9a7418",
          "gold-bright": "#c9a03a",
          "gold-soft": "#7a5c14",
          "gold-soft-dark": "#a3842c",
          text: "#1a1f18",
          muted: "#4d5248"
        },
        bg: "#0b0b0b",
        card: "#141414",
        accent: "#c9a03a"
      },
      boxShadow: {
        soft: "0 10px 40px -20px rgba(201, 160, 58, 0.25)",
        "soft-light": "0 14px 40px -18px rgba(26, 31, 24, 0.1)"
      }
    }
  },
  plugins: []
};

export default config;
