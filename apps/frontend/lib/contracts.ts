export type ContractWorkflowStatus = "draft" | "approved" | "exported";

export type ContractBlockKey =
  | "parti"
  | "oggetto"
  | "inquadramento_retribuzione"
  | "orario_sede"
  | "periodo_prova"
  | "ferie_permessi"
  | "riservatezza"
  | "privacy"
  | "recesso"
  | "firma"
  | "durata"
  | "compenso"
  | "clausole_finali";

export interface ContractPartyInfo {
  companyLegalName: string;
  companyAddress?: string;
  employeeFirstName: string;
  employeeLastName: string;
  employeeAddress?: string;
  roleTitle?: string;
  workLocation?: string;
  startDateIso?: string;
  ralEuros?: number;
  payMonthsPerYear?: 12 | 13 | 14;
}

export interface ContractBlock {
  key: ContractBlockKey;
  title: string;
  content: string;
  locked?: boolean;
}

export interface HrContractDoc {
  id: string;
  title: string;
  status: ContractWorkflowStatus;
  createdAt: string;
  updatedAt: string;
  party: ContractPartyInfo;
  blocks: ContractBlock[];
  lastExportedDocumentId?: string;
  recruitCandidateId?: string;
  recruitPositionId?: string;
}

/** Mappa la risposta API Nest (`GET/PATCH /hr-contracts`) al modello editor. */
export function hrContractFromApi(d: {
  id: string;
  title: string;
  status: ContractWorkflowStatus;
  createdAt: string;
  updatedAt: string;
  party: Record<string, unknown>;
  blocks: unknown[];
  lastExportedDocumentId?: string;
  recruitCandidateId?: string;
  recruitPositionId?: string;
}): HrContractDoc {
  return {
    id: d.id,
    title: d.title,
    status: d.status,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    party: d.party as unknown as ContractPartyInfo,
    blocks: d.blocks as unknown as ContractBlock[],
    lastExportedDocumentId: d.lastExportedDocumentId,
    recruitCandidateId: d.recruitCandidateId,
    recruitPositionId: d.recruitPositionId
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function newLocalDraftId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `local_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function fillTemplate(template: string, party: ContractPartyInfo): string {
  const map: Record<string, string> = {
    "{{companyLegalName}}": party.companyLegalName || "Società",
    "{{companyAddress}}": party.companyAddress || "[indirizzo azienda]",
    "{{employeeFullName}}": `${party.employeeFirstName} ${party.employeeLastName}`.trim(),
    "{{employeeAddress}}": party.employeeAddress || "[indirizzo lavoratore]",
    "{{roleTitle}}": party.roleTitle || "[mansione]",
    "{{workLocation}}": party.workLocation || "[sede]",
    "{{startDate}}": party.startDateIso || "[data inizio]",
    "{{ral}}": party.ralEuros != null ? `${party.ralEuros.toLocaleString("it-IT")} EUR` : "[RAL]",
    "{{payMonths}}": party.payMonthsPerYear != null ? String(party.payMonthsPerYear) : "[mensilità]"
  };
  let out = template;
  for (const [k, v] of Object.entries(map)) {
    out = out.split(k).join(v);
  }
  return out;
}

export function defaultIndeterminatoTemplate(party: ContractPartyInfo): ContractBlock[] {
  const blocks: ContractBlock[] = [
    {
      key: "parti",
      title: "1. Parti",
      content:
        "Tra\n\n- {{companyLegalName}}, con sede in {{companyAddress}} (di seguito, “Datore di lavoro”)\n\nE\n\n- {{employeeFullName}}, residente in {{employeeAddress}} (di seguito, “Lavoratore”)\n\nsi conviene e stipula quanto segue."
    },
    {
      key: "oggetto",
      title: "2. Oggetto del contratto",
      content:
        "Il Datore di lavoro assume il Lavoratore con contratto di lavoro subordinato a tempo indeterminato, con decorrenza dal {{startDate}}, per lo svolgimento delle mansioni di {{roleTitle}}."
    },
    {
      key: "inquadramento_retribuzione",
      title: "3. Inquadramento e retribuzione",
      content:
        "Il rapporto è disciplinato dal CCNL applicato dall’azienda e dalle policy interne. La retribuzione annua lorda è pari a {{ral}}, ripartita su {{payMonths}} mensilità. Eventuali elementi variabili saranno riconosciuti secondo le regole aziendali."
    },
    {
      key: "orario_sede",
      title: "4. Orario di lavoro e sede",
      content:
        "L’orario di lavoro è definito in base all’organizzazione aziendale. La sede di lavoro è {{workLocation}}; eventuali trasferte potranno essere richieste in funzione delle esigenze aziendali."
    },
    {
      key: "periodo_prova",
      title: "5. Periodo di prova",
      content:
        "È previsto un periodo di prova secondo quanto stabilito dal CCNL applicato. Durante tale periodo ciascuna parte potrà recedere senza preavviso, salvo quanto previsto dalla normativa."
    },
    {
      key: "ferie_permessi",
      title: "6. Ferie e permessi",
      content:
        "Il Lavoratore matura ferie e permessi secondo la normativa e il CCNL applicato. La fruizione è concordata con il responsabile e compatibile con le esigenze organizzative."
    },
    {
      key: "riservatezza",
      title: "7. Riservatezza",
      content:
        "Il Lavoratore si impegna a mantenere riservate le informazioni aziendali e a non divulgarle a terzi, salvo autorizzazione o obbligo di legge."
    },
    {
      key: "privacy",
      title: "8. Trattamento dei dati personali",
      content:
        "Il trattamento dei dati personali avviene ai sensi della normativa applicabile. L’informativa privacy è resa disponibile dal Datore di lavoro."
    },
    {
      key: "recesso",
      title: "9. Recesso",
      content:
        "Al di fuori del periodo di prova, il recesso potrà avvenire nel rispetto dei termini di preavviso previsti dal CCNL e dalla normativa vigente."
    },
    {
      key: "firma",
      title: "10. Firma",
      content:
        "Letto, confermato e sottoscritto.\n\nLuogo e data: ____________________\n\nDatore di lavoro: ____________________\n\nLavoratore: ____________________"
    }
  ];
  return blocks.map((b) => ({ ...b, content: fillTemplate(b.content, party) }));
}

export function defaultDeterminatoTemplate(party: ContractPartyInfo): ContractBlock[] {
  const blocks: ContractBlock[] = [
    {
      key: "parti",
      title: "1. Parti",
      content:
        "Tra\n\n- {{companyLegalName}}, con sede in {{companyAddress}} (di seguito, “Datore di lavoro”)\n\nE\n\n- {{employeeFullName}}, residente in {{employeeAddress}} (di seguito, “Lavoratore”)\n\nsi conviene e stipula quanto segue."
    },
    {
      key: "oggetto",
      title: "2. Oggetto del contratto",
      content:
        "Il Datore di lavoro assume il Lavoratore con contratto di lavoro subordinato a tempo determinato, con decorrenza dal {{startDate}}, per lo svolgimento delle mansioni di {{roleTitle}}."
    },
    {
      key: "durata",
      title: "3. Durata",
      content:
        "La durata del rapporto è stabilita fino al __/__/____. Alla scadenza il contratto cesserà senza necessità di disdetta, salvo proroga/rinnovo nei limiti di legge e CCNL."
    },
    {
      key: "inquadramento_retribuzione",
      title: "4. Inquadramento e retribuzione",
      content:
        "Il rapporto è disciplinato dal CCNL applicato dall’azienda e dalle policy interne. La retribuzione annua lorda è pari a {{ral}}, ripartita su {{payMonths}} mensilità."
    },
    {
      key: "orario_sede",
      title: "5. Orario di lavoro e sede",
      content:
        "L’orario di lavoro è definito in base all’organizzazione aziendale. La sede di lavoro è {{workLocation}}; eventuali trasferte potranno essere richieste in funzione delle esigenze aziendali."
    },
    {
      key: "privacy",
      title: "6. Trattamento dei dati personali",
      content:
        "Il trattamento dei dati personali avviene ai sensi della normativa applicabile. L’informativa privacy è resa disponibile dal Datore di lavoro."
    },
    {
      key: "recesso",
      title: "7. Recesso",
      content:
        "Al di fuori del periodo di prova, il recesso potrà avvenire nel rispetto dei termini previsti dal CCNL e dalla normativa vigente."
    },
    {
      key: "firma",
      title: "8. Firma",
      content:
        "Letto, confermato e sottoscritto.\n\nLuogo e data: ____________________\n\nDatore di lavoro: ____________________\n\nLavoratore: ____________________"
    }
  ];
  return blocks.map((b) => ({ ...b, content: fillTemplate(b.content, party) }));
}

export function defaultConsulenzaTemplate(party: ContractPartyInfo): ContractBlock[] {
  const blocks: ContractBlock[] = [
    {
      key: "parti",
      title: "1. Parti",
      content:
        "Tra\n\n- {{companyLegalName}}, con sede in {{companyAddress}} (di seguito, “Committente”)\n\nE\n\n- {{employeeFullName}}, residente in {{employeeAddress}} (di seguito, “Consulente”)\n\nsi conviene e stipula quanto segue."
    },
    {
      key: "oggetto",
      title: "2. Oggetto",
      content:
        "Il Consulente svolgerà attività di consulenza in qualità di {{roleTitle}} a supporto del Committente. Il presente accordo non costituisce rapporto di lavoro subordinato."
    },
    {
      key: "compenso",
      title: "3. Compenso",
      content:
        "Il compenso è definito in accordo tra le parti. Indicazione: {{ral}} (valore indicativo, da adattare al regime fiscale e alle modalità di fatturazione)."
    },
    {
      key: "riservatezza",
      title: "4. Riservatezza",
      content:
        "Il Consulente si impegna a mantenere riservate le informazioni e i dati del Committente e a non divulgarli a terzi, salvo obbligo di legge."
    },
    {
      key: "clausole_finali",
      title: "5. Clausole finali",
      content:
        "Ogni modifica al presente accordo dovrà risultare da atto scritto. Foro competente: ____________________."
    },
    {
      key: "firma",
      title: "6. Firma",
      content:
        "Letto, confermato e sottoscritto.\n\nLuogo e data: ____________________\n\nCommittente: ____________________\n\nConsulente: ____________________"
    }
  ];
  return blocks.map((b) => ({ ...b, content: fillTemplate(b.content, party) }));
}

export function defaultApprendistatoTemplate(party: ContractPartyInfo): ContractBlock[] {
  const blocks: ContractBlock[] = [
    {
      key: "parti",
      title: "1. Parti",
      content:
        "Tra\n\n- {{companyLegalName}}, con sede in {{companyAddress}} (di seguito, “Datore di lavoro”)\n\nE\n\n- {{employeeFullName}}, residente in {{employeeAddress}} (di seguito, “Apprendista”)\n\nsi conviene e stipula quanto segue."
    },
    {
      key: "oggetto",
      title: "2. Oggetto",
      content:
        "Il Datore di lavoro assume l’Apprendista con contratto di apprendistato con decorrenza dal {{startDate}} per le mansioni di {{roleTitle}}, secondo il CCNL applicato."
    },
    {
      key: "durata",
      title: "3. Durata e formazione",
      content:
        "La durata dell’apprendistato e il piano formativo individuale saranno definiti secondo CCNL e normativa applicabile. La sede di lavoro è {{workLocation}}."
    },
    {
      key: "inquadramento_retribuzione",
      title: "4. Inquadramento e retribuzione",
      content:
        "L’inquadramento e la progressione retributiva seguono quanto previsto dal CCNL e dal piano formativo. Indicazione: {{ral}} ripartita su {{payMonths}} mensilità."
    },
    {
      key: "firma",
      title: "5. Firma",
      content:
        "Letto, confermato e sottoscritto.\n\nLuogo e data: ____________________\n\nDatore di lavoro: ____________________\n\nApprendista: ____________________"
    }
  ];
  return blocks.map((b) => ({ ...b, content: fillTemplate(b.content, party) }));
}

export const CONTRACT_BLOCK_LIBRARY: Array<Pick<ContractBlock, "key" | "title" | "content">> = [
  {
    key: "periodo_prova",
    title: "Periodo di prova (standard)",
    content:
      "È previsto un periodo di prova secondo quanto stabilito dal CCNL applicato. Durante tale periodo ciascuna parte potrà recedere senza preavviso, salvo quanto previsto dalla normativa."
  },
  {
    key: "riservatezza",
    title: "Riservatezza (standard)",
    content:
      "Il Lavoratore si impegna a mantenere riservate le informazioni aziendali e a non divulgarle a terzi, salvo autorizzazione o obbligo di legge."
  },
  {
    key: "privacy",
    title: "Privacy (standard)",
    content:
      "Il trattamento dei dati personali avviene ai sensi della normativa applicabile. L’informativa privacy è resa disponibile dal Datore di lavoro."
  }
];

/**
 * Bozza lato client (id/timestamp servono solo finché non viene creato il record sul server).
 */
export function createNewContract(party: ContractPartyInfo): HrContractDoc {
  const now = nowIso();
  const title = `Contratto indeterminato - ${party.employeeFirstName} ${party.employeeLastName}`.trim();
  return {
    id: newLocalDraftId(),
    title,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    party,
    blocks: defaultIndeterminatoTemplate(party)
  };
}

export type HrContractTemplateKey = "indeterminato" | "determinato" | "apprendistato" | "consulenza";

export function createNewContractFromTemplate(party: ContractPartyInfo, template: HrContractTemplateKey): HrContractDoc {
  const now = nowIso();
  const label =
    template === "determinato"
      ? "determinato"
      : template === "apprendistato"
        ? "apprendistato"
        : template === "consulenza"
          ? "consulenza"
          : "indeterminato";
  const title = `Contratto ${label} - ${party.employeeFirstName} ${party.employeeLastName}`.trim();
  const blocks =
    template === "determinato"
      ? defaultDeterminatoTemplate(party)
      : template === "apprendistato"
        ? defaultApprendistatoTemplate(party)
        : template === "consulenza"
          ? defaultConsulenzaTemplate(party)
          : defaultIndeterminatoTemplate(party);
  return {
    id: newLocalDraftId(),
    title,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    party,
    blocks
  };
}
