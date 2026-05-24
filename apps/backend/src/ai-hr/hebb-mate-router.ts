import type { HebbMateCapabilityId, HebbMateRoutedIntent } from "./hebb-mate.types";

const ROUTE_RULES: Array<{ intent: HebbMateRoutedIntent; patterns: RegExp[] }> = [
  {
    intent: "contract_generation",
    patterns: [
      /\bcontratt/i,
      /\bgenera.*lavoro/i,
      /\bassunz/i,
      /\baccordo\s*smart/i,
      /\bremote\s*work/i,
      /\bsmart\s*working/i
    ]
  },
  {
    intent: "document_generation",
    patterns: [
      /\bdocument/i,
      /\bcertificat/i,
      /\battestat/i,
      /\blettera/i,
      /\battestato/i,
      /\bcrea.*pdf/i
    ]
  },
  {
    intent: "cv_screening",
    patterns: [/\bcv\b/i, /\bcurriculum/i, /\bscreening/i, /\bcandidat/i, /\brecruit/i]
  },
  {
    intent: "document_email",
    patterns: [/\binvia.*mail/i, /\bemail/i, /\bnotifica.*document/i, /\bspedisc/i]
  },
  {
    intent: "reports",
    patterns: [/\breport/i, /\briepilog/i, /\bpanoramic/i, /\banalisi\s*hr/i, /\bmetriche/i]
  },
  {
    intent: "skill_suggestions",
    patterns: [/\bskill/i, /\bcompetenz/i, /\bcapacit/i, /\bfabbisogn/i]
  },
  {
    intent: "automation_proposals",
    patterns: [
      /\bautomat/i,
      /\bschedul/i,
      /\bpianifica/i,
      /\bricorrent/i,
      /\bfrequenz/i,
      /\bcron/i,
      /\btimbratur/i
    ]
  },
  {
    intent: "cowork_batch",
    patterns: [
      /\bbatch/i,
      /\brinnov.*accord/i,
      /\bapprova\s*tutt/i,
      /\bpiano\s*cowork/i,
      /\boperazioni\s*di\s*massa/i
    ]
  }
];

export function routeHebbMateIntent(message: string, explicitCapability?: HebbMateCapabilityId): HebbMateRoutedIntent {
  if (explicitCapability) {
    return explicitCapability;
  }
  const text = message.trim();
  if (!text) {
    return "general";
  }
  for (const rule of ROUTE_RULES) {
    if (rule.patterns.some((re) => re.test(text))) {
      return rule.intent;
    }
  }
  return "general";
}

export function extractContractKind(message: string): "employment" | "remote_working" {
  if (/smart|remote|agile|telelavoro/i.test(message)) {
    return "remote_working";
  }
  return "employment";
}

export function extractDocumentKind(message: string): import("./hebb-mate.types").HebbMateDocumentKind {
  if (/formaz|corso|training|attestato/i.test(message)) {
    return "certificate_training";
  }
  if (/presenz|timbratur|frequenz/i.test(message)) {
    return "certificate_attendance";
  }
  if (/smart|remote|agile/i.test(message)) {
    return "smartworking_letter";
  }
  if (/assunz|lavoro|employment/i.test(message)) {
    return "employment_letter";
  }
  return "generic";
}
