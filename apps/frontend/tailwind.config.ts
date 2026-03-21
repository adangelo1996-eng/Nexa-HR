import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        synapse: ["var(--font-synapse-wordmark)", "Montserrat", "Inter", "system-ui", "sans-serif"]
      },
      colors: {
        bg: "#0f172a",
        card: "#111827",
        accent: "#22d3ee"
      },
      boxShadow: {
        soft: "0 10px 40px -20px rgba(34, 211, 238, 0.5)"
      }
    }
  },
  plugins: []
};

export default config;
