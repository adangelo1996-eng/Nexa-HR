"use client";

import {
  HebbAiExperienceShell,
  type HebbAiExperienceShellProps
} from "@/components/hebb-ai-experience-shell";

/** Guscio pagina HR autenticata: stesso layout del Pannello manager (badge, titolo centrato, area contenuto). */
export function NexaHrAppPage(props: HebbAiExperienceShellProps): React.JSX.Element {
  return <HebbAiExperienceShell {...props} />;
}
