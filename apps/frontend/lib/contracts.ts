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
  /** CTT, part-time a termine, apprendistato: data fine rapporto (YYYY-MM-DD). */
  endDateIso?: string;
  /** Causalità / motivazione per contratto a termine (art. 19 D.Lgs. 81/2015). */
  fixedTermReason?: string;
  /** Part-time: ore contrattuali settimanali. */
  weeklyHours?: number;
  /** Lavoro intermittente: modalità di disponibilità, chiamata, orari medi, ecc. */
  intermittentWorkDescription?: string;
  /** Collaborazione / consulenza: descrizione sintetica dell’oggetto della prestazione. */
  projectScopeSummary?: string;
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
  signedScanDocumentId?: string;
  /** Data/ora firma lato sistema (dopo «Firma» con nominativi). */
  signedAt?: string;
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
  signedScanDocumentId?: string;
  signedAt?: string;
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
    signedScanDocumentId: d.signedScanDocumentId,
    signedAt: d.signedAt,
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

function formatItLongDateFromIso(iso?: string): string {
  const raw = iso?.trim();
  if (!raw) {
    return "[data]";
  }
  const d = new Date(`${raw.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    return raw;
  }
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

/** Applica i placeholder `{{…}}` dei blocchi al profilo attuale (senza salvare sul server). */
export function applyPartyPlaceholdersToContractBlocks(blocks: ContractBlock[], party: ContractPartyInfo): ContractBlock[] {
  return blocks.map((b) => ({ ...b, content: fillTemplate(b.content, party) }));
}

function fillTemplate(template: string, party: ContractPartyInfo): string {
  const map: Record<string, string> = {
    "{{companyLegalName}}": party.companyLegalName || "Società",
    "{{companyAddress}}": party.companyAddress || "[indirizzo azienda]",
    "{{employeeFullName}}": `${party.employeeFirstName} ${party.employeeLastName}`.trim(),
    "{{employeeAddress}}": party.employeeAddress || "[indirizzo lavoratore]",
    "{{roleTitle}}": party.roleTitle || "[mansione]",
    "{{workLocation}}": party.workLocation || "[sede]",
    "{{startDate}}": party.startDateIso ? formatItLongDateFromIso(party.startDateIso) : "[data inizio]",
    "{{endDate}}": party.endDateIso ? formatItLongDateFromIso(party.endDateIso) : "[data fine rapporto]",
    "{{fixedTermReason}}": party.fixedTermReason?.trim() || "[causale / motivazione del termine]",
    "{{weeklyHours}}":
      party.weeklyHours != null && party.weeklyHours > 0
        ? `${party.weeklyHours} ore settimanali`
        : "[ore settimanali contrattuali]",
    "{{intermittentWorkDescription}}":
      party.intermittentWorkDescription?.trim() || "[modalità di disponibilità, chiamata e ripartizione oraria]",
    "{{projectScopeSummary}}": party.projectScopeSummary?.trim() || "[ambito e finalità della prestazione]",
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
      title: "3. Durata e causalità",
      content:
        "La durata del rapporto è stabilita dal {{startDate}} al {{endDate}}. La stipula a termine è giustificata dalla seguente esigenza temporanea e documentabile: {{fixedTermReason}}. Alla scadenza il contratto cesserà senza necessità di disdetta, salvo proroga/rinnovo nei limiti di legge e CCNL."
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
        "Il Consulente svolgerà attività di consulenza in qualità di {{roleTitle}} a supporto del Committente, con il seguente ambito: {{projectScopeSummary}}. Il presente accordo non costituisce rapporto di lavoro subordinato."
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
        "Il contratto ha decorrenza dal {{startDate}} e termine al {{endDate}} (da adeguare a CCNL e piano formativo). La sede di lavoro è {{workLocation}}. Il dettaglio del percorso formativo sarà formalizzato secondo normativa e accordi applicabili."
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

export function defaultPartTimeIndeterminatoTemplate(party: ContractPartyInfo): ContractBlock[] {
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
        "Il Datore di lavoro assume il Lavoratore con contratto di lavoro subordinato a tempo indeterminato, a tempo parziale, con orario contrattuale di {{weeklyHours}}, con decorrenza dal {{startDate}}, per lo svolgimento delle mansioni di {{roleTitle}}."
    },
    {
      key: "inquadramento_retribuzione",
      title: "3. Inquadramento e retribuzione",
      content:
        "Il rapporto è disciplinato dal CCNL applicato dall’azienda e dalle policy interne. La retribuzione annua lorda è pari a {{ral}}, ripartita su {{payMonths}} mensilità, proporzionata all’orario part-time ove previsto dal CCNL."
    },
    {
      key: "orario_sede",
      title: "4. Orario di lavoro e sede",
      content:
        "L’orario contrattuale settimanale è {{weeklyHours}}; la ripartizione sui giorni sarà definita dal responsabile secondo organizzazione e CCNL. La sede di lavoro è {{workLocation}}."
    },
    {
      key: "periodo_prova",
      title: "5. Periodo di prova",
      content:
        "È previsto un periodo di prova secondo quanto stabilito dal CCNL applicato, eventualmente proporzionato al part-time. Durante tale periodo ciascuna parte potrà recedere nei limiti di legge."
    },
    {
      key: "ferie_permessi",
      title: "6. Ferie e permessi",
      content:
        "Il Lavoratore matura ferie e permessi secondo la normativa e il CCNL applicato, in proporzione all’orario. La fruizione è concordata con il responsabile."
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

export function defaultPartTimeDeterminatoTemplate(party: ContractPartyInfo): ContractBlock[] {
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
        "Il Datore di lavoro assume il Lavoratore con contratto di lavoro subordinato a tempo determinato e a tempo parziale, con orario contrattuale di {{weeklyHours}}, con decorrenza dal {{startDate}}, per lo svolgimento delle mansioni di {{roleTitle}}."
    },
    {
      key: "durata",
      title: "3. Durata e causalità",
      content:
        "La durata del rapporto è stabilita dal {{startDate}} al {{endDate}}. La stipula a termine è giustificata dalla seguente esigenza temporanea e documentabile: {{fixedTermReason}}. Alla scadenza il contratto cesserà senza necessità di disdetta, salvo proroga/rinnovo nei limiti di legge e CCNL."
    },
    {
      key: "inquadramento_retribuzione",
      title: "4. Inquadramento e retribuzione",
      content:
        "Il rapporto è disciplinato dal CCNL applicato dall’azienda e dalle policy interne. La retribuzione annua lorda è pari a {{ral}}, ripartita su {{payMonths}} mensilità, proporzionata all’orario part-time ove previsto dal CCNL."
    },
    {
      key: "orario_sede",
      title: "5. Orario di lavoro e sede",
      content:
        "L’orario contrattuale settimanale è {{weeklyHours}}; la sede di lavoro è {{workLocation}}."
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

export function defaultIntermittenteTemplate(party: ContractPartyInfo): ContractBlock[] {
  const blocks: ContractBlock[] = [
    {
      key: "parti",
      title: "1. Parti",
      content:
        "Tra\n\n- {{companyLegalName}}, con sede in {{companyAddress}} (di seguito, “Datore di lavoro”)\n\nE\n\n- {{employeeFullName}}, residente in {{employeeAddress}} (di seguito, “Lavoratore”)\n\nsi conviene e stipula quanto segue."
    },
    {
      key: "oggetto",
      title: "2. Oggetto",
      content:
        "Il Datore di lavoro assume il Lavoratore con contratto di lavoro intermittente (su chiamata), con decorrenza dal {{startDate}}, per le mansioni di {{roleTitle}}, secondo CCNL e normativa applicabile."
    },
    {
      key: "durata",
      title: "3. Modalità di disponibilità e chiamata",
      content:
        "Le parti concordano la seguente organizzazione del lavoro intermittente: {{intermittentWorkDescription}}. Le prestazioni saranno rese solo in caso di chiamata del Datore di lavoro, nei limiti di legge e di contratto."
    },
    {
      key: "inquadramento_retribuzione",
      title: "4. Retribuzione",
      content:
        "La retribuzione sarà corrisposta in ragione delle giornate o ore effettivamente lavorate secondo quanto previsto da CCNL e accordi applicabili. Indicazione annua di riferimento: {{ral}} (da declinare su base oraria/giornaliera secondo CCNL)."
    },
    {
      key: "orario_sede",
      title: "5. Sede",
      content:
        "Le prestazioni potranno essere rese prevalentemente presso {{workLocation}} o altre sedi comunicate in occasione della chiamata, compatibilmente con le esigenze del servizio."
    },
    {
      key: "firma",
      title: "6. Firma",
      content:
        "Letto, confermato e sottoscritto.\n\nLuogo e data: ____________________\n\nDatore di lavoro: ____________________\n\nLavoratore: ____________________"
    }
  ];
  return blocks.map((b) => ({ ...b, content: fillTemplate(b.content, party) }));
}

export function defaultCollaborazioneTemplate(party: ContractPartyInfo): ContractBlock[] {
  const blocks: ContractBlock[] = [
    {
      key: "parti",
      title: "1. Parti",
      content:
        "Tra\n\n- {{companyLegalName}}, con sede in {{companyAddress}} (di seguito, “Committente”)\n\nE\n\n- {{employeeFullName}}, residente in {{employeeAddress}} (di seguito, “Collaboratore”)\n\nsi conviene e stipula quanto segue."
    },
    {
      key: "oggetto",
      title: "2. Oggetto della collaborazione",
      content:
        "Il Collaboratore coordina e porta a termine, in autonomia organizzativa, le attività connesse a: {{projectScopeSummary}}. La collaborazione è regolata dalla disciplina applicabile al rapporto di collaborazione coordinata e continuativa a progetto, ove applicabile."
    },
    {
      key: "compenso",
      title: "3. Compenso",
      content:
        "Il compenso complessivo per l’attività di progetto è indicato in {{ral}} (lordo), con modalità di erogazione e oneri previsti da accordo scritto e normativa vigente."
    },
    {
      key: "riservatezza",
      title: "4. Riservatezza",
      content:
        "Il Collaboratore si impegna a mantenere riservate le informazioni del Committente e a non divulgarle a terzi, salvo obbligo di legge."
    },
    {
      key: "clausole_finali",
      title: "5. Clausole finali",
      content:
        "Ogni modifica dovrà risultare da atto scritto. Foro competente: ____________________."
    },
    {
      key: "firma",
      title: "6. Firma",
      content:
        "Letto, confermato e sottoscritto.\n\nLuogo e data: ____________________\n\nCommittente: ____________________\n\nCollaboratore: ____________________"
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

export type HrContractTemplateKey =
  | "indeterminato"
  | "determinato"
  | "apprendistato"
  | "consulenza"
  | "part_time_indeterminato"
  | "part_time_determinato"
  | "lavoro_intermittente"
  | "collaborazione";

export const HR_CONTRACT_TEMPLATE_OPTIONS: Array<{
  key: HrContractTemplateKey;
  label: string;
  description: string;
}> = [
  {
    key: "indeterminato",
    label: "Subordinato a tempo indeterminato",
    description: "Assunzione classica senza scadenza; periodo di prova e clausole standard."
  },
  {
    key: "determinato",
    label: "Subordinato a tempo determinato (CTT)",
    description: "Richiede data di fine rapporto e motivazione del termine (causale)."
  },
  {
    key: "part_time_indeterminato",
    label: "Part-time indeterminato",
    description: "Come l’indeterminato, con ore settimanali contrattuali."
  },
  {
    key: "part_time_determinato",
    label: "Part-time a tempo determinato",
    description: "Ore settimanali, data di scadenza e causalità del termine."
  },
  {
    key: "apprendistato",
    label: "Apprendistato",
    description: "Percorso formativo; indicare anche la data di fine prevista."
  },
  {
    key: "lavoro_intermittente",
    label: "Lavoro intermittente (su chiamata)",
    description: "Descrivere modalità di disponibilità, chiamata e ripartizione oraria."
  },
  {
    key: "consulenza",
    label: "Consulenza esterna (non subordinata)",
    description: "Accordo con Committente; indicare l’ambito della prestazione."
  },
  {
    key: "collaborazione",
    label: "Collaborazione a progetto (schema base)",
    description: "Coordinamento e continuità su progetto; richiede descrizione dell’oggetto."
  }
];

/** Mappa chiavi legacy DB (es. migration 070 `part_time`) ai template editor. */
export function normalizeContractPresetTemplateKey(key: string): HrContractTemplateKey {
  const aliases: Record<string, HrContractTemplateKey> = {
    part_time: "part_time_indeterminato"
  };
  const resolved = aliases[key] ?? key;
  if (HR_CONTRACT_TEMPLATE_OPTIONS.some((o) => o.key === resolved)) {
    return resolved as HrContractTemplateKey;
  }
  return "indeterminato";
}

export type ContractTemplateFormConfig = {
  showEndDate: boolean;
  showFixedTermReason: boolean;
  showWeeklyHours: boolean;
  showIntermittentDescription: boolean;
  showProjectScope: boolean;
  requireEndDate: boolean;
  requireFixedTermReason: boolean;
  requireWeeklyHours: boolean;
  requireIntermittentDescription: boolean;
  requireProjectScope: boolean;
};

export const CONTRACT_TEMPLATE_FORM: Record<HrContractTemplateKey, ContractTemplateFormConfig> = {
  indeterminato: {
    showEndDate: false,
    showFixedTermReason: false,
    showWeeklyHours: false,
    showIntermittentDescription: false,
    showProjectScope: false,
    requireEndDate: false,
    requireFixedTermReason: false,
    requireWeeklyHours: false,
    requireIntermittentDescription: false,
    requireProjectScope: false
  },
  determinato: {
    showEndDate: true,
    showFixedTermReason: true,
    showWeeklyHours: false,
    showIntermittentDescription: false,
    showProjectScope: false,
    requireEndDate: true,
    requireFixedTermReason: true,
    requireWeeklyHours: false,
    requireIntermittentDescription: false,
    requireProjectScope: false
  },
  part_time_indeterminato: {
    showEndDate: false,
    showFixedTermReason: false,
    showWeeklyHours: true,
    showIntermittentDescription: false,
    showProjectScope: false,
    requireEndDate: false,
    requireFixedTermReason: false,
    requireWeeklyHours: true,
    requireIntermittentDescription: false,
    requireProjectScope: false
  },
  part_time_determinato: {
    showEndDate: true,
    showFixedTermReason: true,
    showWeeklyHours: true,
    showIntermittentDescription: false,
    showProjectScope: false,
    requireEndDate: true,
    requireFixedTermReason: true,
    requireWeeklyHours: true,
    requireIntermittentDescription: false,
    requireProjectScope: false
  },
  apprendistato: {
    showEndDate: true,
    showFixedTermReason: false,
    showWeeklyHours: false,
    showIntermittentDescription: false,
    showProjectScope: false,
    requireEndDate: true,
    requireFixedTermReason: false,
    requireWeeklyHours: false,
    requireIntermittentDescription: false,
    requireProjectScope: false
  },
  lavoro_intermittente: {
    showEndDate: false,
    showFixedTermReason: false,
    showWeeklyHours: false,
    showIntermittentDescription: true,
    showProjectScope: false,
    requireEndDate: false,
    requireFixedTermReason: false,
    requireWeeklyHours: false,
    requireIntermittentDescription: true,
    requireProjectScope: false
  },
  consulenza: {
    showEndDate: false,
    showFixedTermReason: false,
    showWeeklyHours: false,
    showIntermittentDescription: false,
    showProjectScope: true,
    requireEndDate: false,
    requireFixedTermReason: false,
    requireWeeklyHours: false,
    requireIntermittentDescription: false,
    requireProjectScope: true
  },
  collaborazione: {
    showEndDate: false,
    showFixedTermReason: false,
    showWeeklyHours: false,
    showIntermittentDescription: false,
    showProjectScope: true,
    requireEndDate: false,
    requireFixedTermReason: false,
    requireWeeklyHours: false,
    requireIntermittentDescription: false,
    requireProjectScope: true
  }
};

export function contractPartyPassesTemplateValidation(
  party: ContractPartyInfo,
  template: HrContractTemplateKey
): boolean {
  const c = CONTRACT_TEMPLATE_FORM[template];
  if (c.requireEndDate && !party.endDateIso?.trim()) {
    return false;
  }
  if (c.requireFixedTermReason && !party.fixedTermReason?.trim()) {
    return false;
  }
  if (c.requireWeeklyHours && (party.weeklyHours == null || party.weeklyHours <= 0 || party.weeklyHours > 40)) {
    return false;
  }
  if (c.requireIntermittentDescription && !party.intermittentWorkDescription?.trim()) {
    return false;
  }
  if (c.requireProjectScope && !party.projectScopeSummary?.trim()) {
    return false;
  }
  return true;
}

const TEMPLATE_TITLE_LABEL: Record<HrContractTemplateKey, string> = {
  indeterminato: "indeterminato",
  determinato: "determinato",
  apprendistato: "apprendistato",
  consulenza: "consulenza",
  part_time_indeterminato: "part-time indeterminato",
  part_time_determinato: "part-time determinato",
  lavoro_intermittente: "intermittente",
  collaborazione: "collaborazione a progetto"
};

function blocksForTemplate(party: ContractPartyInfo, template: HrContractTemplateKey): ContractBlock[] {
  switch (template) {
    case "determinato":
      return defaultDeterminatoTemplate(party);
    case "apprendistato":
      return defaultApprendistatoTemplate(party);
    case "consulenza":
      return defaultConsulenzaTemplate(party);
    case "part_time_indeterminato":
      return defaultPartTimeIndeterminatoTemplate(party);
    case "part_time_determinato":
      return defaultPartTimeDeterminatoTemplate(party);
    case "lavoro_intermittente":
      return defaultIntermittenteTemplate(party);
    case "collaborazione":
      return defaultCollaborazioneTemplate(party);
    default:
      return defaultIndeterminatoTemplate(party);
  }
}

export function createNewContractFromTemplate(party: ContractPartyInfo, template: HrContractTemplateKey): HrContractDoc {
  const now = nowIso();
  const label = TEMPLATE_TITLE_LABEL[template];
  const title = `Contratto ${label} - ${party.employeeFirstName} ${party.employeeLastName}`.trim();
  const blocks = blocksForTemplate(party, template);
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
