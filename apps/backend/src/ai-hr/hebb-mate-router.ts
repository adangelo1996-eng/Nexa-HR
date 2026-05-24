import type { HebbMateCapabilityId, HebbMateRoutedIntent } from "./hebb-mate.types";

/** Italian + English automation/scheduling cues (not `\bautomat` — misses «automazioni»). */
export const MATE_AUTOMATION_INTENT_PATTERNS: RegExp[] = [
  /\bautomaz/i,
  /\bautomat\b/i,
  /\bschedul/i,
  /\bpianifica/i,
  /\bricorrent/i,
  /\bfrequenz/i,
  /\bcron\b/i,
  /\btimbratur/i,
  /\btask\s+ricorrent/i,
  /\b(mensil|settimanal|giornalier|trimestral|annual)\w*\b/i
];

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
    patterns: MATE_AUTOMATION_INTENT_PATTERNS
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

const SUGGESTION_INTENT_PATTERNS = [
  /\bcosa\s+pu[oò]\s+(fare|automat|generare|chiedere)/i,
  /\bcosa\s+(sa|sai)\s+fare/i,
  /\bsuggeriment/i,
  /\bhelp\b/i,
  /\baiut(o|ami)?\b/i,
  /\bcapabilit/i,
  /\bidee?\s+(per|hr)/i,
  /\bcome\s+funziona\b/i,
  /\bmostra.*esempi/i,
  /\besempi\s+di\s+(prompt|richieste?)/i,
  /\bcosa\s+offr/i,
  /\bquali\s+operazioni/i
];

function routeHebbMateIntentFromText(text: string): HebbMateRoutedIntent {
  const trimmed = text.trim();
  if (!trimmed) {
    return "general";
  }
  for (const rule of ROUTE_RULES) {
    if (rule.patterns.some((re) => re.test(trimmed))) {
      return rule.intent;
    }
  }
  return "general";
}

/** True when the user asks for help, examples, or what Mate can do (not a concrete HR action). */
export function isHebbMateSuggestionIntent(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (routeHebbMateIntentFromText(text) !== "general") return false;
  return SUGGESTION_INTENT_PATTERNS.some((re) => re.test(text));
}

export function routeHebbMateIntent(
  message: string,
  explicitCapability?: HebbMateCapabilityId,
  alternateMessage?: string
): HebbMateRoutedIntent {
  if (explicitCapability) {
    return explicitCapability;
  }
  for (const candidate of [message, alternateMessage]) {
    if (typeof candidate !== "string") continue;
    const intent = routeHebbMateIntentFromText(candidate);
    if (intent !== "general") {
      return intent;
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
