import type { HebbMateCapabilityCard } from "./hebb-mate.types";

export const HEBB_MATE_CAPABILITY_CARDS: HebbMateCapabilityCard[] = [
  {
    id: "contract_generation",
    title: "Generazione contratti",
    description:
      "Contratti di lavoro e accordi smart working da anagrafica aziendale, per persona o perimetro team/CDC.",
    icon: "file-signature",
    requiredPermissions: ["nexa.lifecycle:read"],
    examplePrompts: [
      "Genera contratto di lavoro per il team Marketing",
      "Crea accordo smart working 2026 per tutti nel CDC Vendite"
    ]
  },
  {
    id: "document_generation",
    title: "Documenti HR",
    description: "Attestati, lettere, certificati e documenti vault — anche per singolo dipendente.",
    icon: "file-text",
    requiredPermissions: ["nexa.documents:write"],
    examplePrompts: [
      "Genera attestato di frequenza corso sicurezza",
      "Crea lettera smart working per Marco Rossi"
    ]
  },
  {
    id: "cv_screening",
    title: "Screening CV",
    description: "Valutazione preliminare CV vs posizione con punteggio 0–100 e gap analysis.",
    icon: "user-search",
    requiredPermissions: ["nexa.recruiting:write"],
    examplePrompts: ["Screening CV candidato per posizione Sviluppatore", "Valuta fit CV vs job description"]
  },
  {
    id: "document_email",
    title: "Invio documenti",
    description: "Genera documento e notifica il dipendente (in-app + webhook email se configurato).",
    icon: "mail",
    requiredPermissions: ["nexa.documents:write"],
    examplePrompts: ["Invia contratto firmato a dipendente via email", "Notifica documento vault al team"]
  },
  {
    id: "reports",
    title: "Report HR",
    description: "Report sintetici per dipendente, team o centro di costo con metriche operative.",
    icon: "bar-chart",
    requiredPermissions: ["nexa.lifecycle:read"],
    examplePrompts: [
      "Report team Marketing: ferie, competenze e documenti",
      "Panoramica CDC Amministrazione"
    ]
  },
  {
    id: "skill_suggestions",
    title: "Competenze per ruolo",
    description: "Suggerimenti skill tipiche dal catalogo ruolo e gap analysis aziendale.",
    icon: "sparkles",
    requiredPermissions: ["nexa.lifecycle:read"],
    examplePrompts: ["Quali competenze servono per un Product Manager?", "Skill consigliate per il mio ruolo"]
  },
  {
    id: "automation_proposals",
    title: "Automazioni HR",
    description: "Proposte di task ricorrenti per area (presenze, documenti, lifecycle) con frequenza suggerita.",
    icon: "calendar-clock",
    requiredPermissions: ["nexa.lifecycle:read"],
    examplePrompts: [
      "Suggerisci automazioni mensili per HR",
      "Quali task posso schedulare per il team?"
    ]
  }
];
