import type { CSSProperties } from "react";

/**
 * Stesso aspetto per SYNAPSE, NEXA HR e mega titolo: Montserrat (Next) per primo,
 * poi Golden Rooster come fallback decorativo — evita il look “monospace” sul titolo grande.
 */
export const synapseSuiteDisplayStyle = {
  fontSynthesis: "none",
  fontVariantNumeric: "proportional-nums",
  fontFamily: "var(--font-montserrat), var(--font-synapse-wordmark), Montserrat, system-ui, sans-serif"
} satisfies CSSProperties;
