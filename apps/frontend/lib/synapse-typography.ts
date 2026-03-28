import type { CSSProperties } from "react";

/**
 * Wordmark suite: **Golden Rooster** (file da Synapse - Site/fonts / `fonts/golden-rooster.ttf`),
 * poi Montserrat come fallback. Allineato a Plasticity / Synapse Site `--font-synapse-display`.
 */
export const synapseSuiteDisplayStyle = {
  fontSynthesis: "none",
  fontVariantNumeric: "proportional-nums",
  fontFamily:
    '"Golden Rooster", var(--font-synapse-wordmark), var(--font-montserrat), Montserrat, system-ui, sans-serif'
} satisfies CSSProperties;
