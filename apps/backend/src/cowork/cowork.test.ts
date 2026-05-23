import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COWORK_HIGH_RISK_TOOL_IDS,
  COWORK_TOOL_CATALOG,
  COWORK_TOOL_LIST
} from "./cowork-tool-catalog";
import { CoworkOrchestratorService } from "./cowork-orchestrator.service";
import { CoworkPlannerService } from "./cowork-planner.service";

describe("cowork domain classification", () => {
  const svc = Object.create(CoworkOrchestratorService.prototype) as CoworkOrchestratorService;

  it("prioritizza accordi su richieste e contratti (classifyDomain)", () => {
    assert.equal(
      svc.classifyDomain("Rinnova accordi smart working e estendi richieste approvate"),
      "smartworking_agreements"
    );
  });

  it("classifica estensione richieste", () => {
    assert.equal(svc.classifyDomain("Estendi richieste remote approvate fino a fine anno"), "smartworking_requests");
  });

  it("classifica contratti con clausola SW", () => {
    assert.equal(svc.classifyDomain("Aggiorna contratti di lavoro con clausola smart working"), "employment_contracts");
  });

  it("formazione batch → dominio training", () => {
    assert.equal(svc.classifyDomain("Assegna corso formazione obbligatorio a tutti"), "training");
  });

  it("classifyDomains restituisce più domini se il messaggio li mescola", () => {
    const domains = svc.classifyDomains("Rinnova accordi smart working e estendi richieste approvate");
    assert.deepEqual(domains, ["smartworking_agreements", "smartworking_requests"]);
  });

  it("classifyToolHints riconosce prenotazione calendario", () => {
    const hints = svc.classifyToolHints("Prenota sala riunioni domani 10:00-11:00 titolo Riunione HR");
    assert.ok(hints.includes("create_meeting_room_booking"));
  });

  it("classifyToolHints riconosce ferie", () => {
    const hints = svc.classifyToolHints("Inserisci ferie 15-20 agosto per il team");
    assert.ok(hints.includes("create_leave_plan"));
  });

  it("classifyToolHints riconosce payroll batch e budget", () => {
    assert.ok(svc.classifyToolHints("Genera cedolini batch 2026-05 per il team").includes("payroll_batch_generate"));
    assert.ok(svc.classifyToolHints("Aggiorna budget personale RAL 4500").includes("personnel_budget_adjust"));
    assert.ok(svc.classifyToolHints("Sync LinkedIn posizioni aperte").includes("recruiting_linkedin_sync"));
  });

  it("classifyDomains include calendar per evento agenda", () => {
    const domains = svc.classifyDomains("Inserisci evento in calendario sala riunioni");
    assert.ok(domains.includes("calendar"));
  });

  it("classifyToolHints riconosce onboarding da candidato", () => {
    const hints = svc.classifyToolHints("Avvia onboarding da candidato selezione");
    assert.ok(hints.includes("start_onboarding_from_candidate"));
  });

  it("classifyToolHints riconosce promemoria documenti", () => {
    const hints = svc.classifyToolHints("Invia promemoria lettura documento vault");
    assert.ok(hints.includes("link_document_ack"));
  });
});

describe("cowork tool catalog", () => {
  it("espone 37 tool eseguibili nel catalogo", () => {
    assert.equal(COWORK_TOOL_LIST.length, 37);
    assert.equal(COWORK_TOOL_LIST.filter((t) => t.executable).length, 37);
  });

  it("espone tool eseguibili per domini operativi legacy", () => {
    assert.ok(COWORK_TOOL_CATALOG.renew_agreements.executable);
    assert.ok(COWORK_TOOL_CATALOG.extend_approved_requests.executable);
    assert.ok(COWORK_TOOL_CATALOG.update_contract_sw_clause.executable);
    assert.equal(COWORK_TOOL_CATALOG.training_batch.executable, true);
    assert.equal(COWORK_TOOL_CATALOG.start_onboarding_from_candidate.executable, true);
    assert.equal(COWORK_TOOL_CATALOG.corporate_policy_publish.executable, true);
  });

  it("calendar booking è eseguibile", () => {
    assert.ok(COWORK_TOOL_CATALOG.create_meeting_room_booking.executable);
    assert.equal(COWORK_TOOL_CATALOG.create_meeting_room_booking.areaId, "calendar");
  });

  it("ogni tool ha areaId e permissions array", () => {
    for (const tool of COWORK_TOOL_LIST) {
      assert.ok(tool.areaId);
      assert.ok(Array.isArray(tool.permissions));
    }
  });

  it("payroll ad alto rischio include publish e batch generate", () => {
    assert.ok(COWORK_HIGH_RISK_TOOL_IDS.has("publish_payslips_period"));
    assert.ok(COWORK_HIGH_RISK_TOOL_IDS.has("payroll_batch_generate"));
    assert.equal(COWORK_TOOL_CATALOG.publish_payslips_period.areaId, "payroll");
    assert.equal(COWORK_TOOL_CATALOG.personnel_budget_adjust.areaId, "personnel_budget");
    assert.equal(COWORK_TOOL_CATALOG.recruiting_linkedin_sync.areaId, "recruiting");
    assert.ok(COWORK_TOOL_CATALOG.third_party_license_assign.executable);
    assert.ok(COWORK_TOOL_CATALOG.export_employees_preview.executable);
    assert.equal(COWORK_TOOL_CATALOG.corporate_policy_publish.areaId, "corporate_policies");
  });
});

describe("cowork planner regex fallback", () => {
  const planner = Object.create(CoworkPlannerService.prototype) as CoworkPlannerService;

  it("ritorna chiarimento con aree se nessun tool eseguibile", () => {
    const result = planner.regexFallbackInterpret(["unknown"], [], [], 10, "fai qualcosa di vago", false, 0);
    assert.equal(result.kind, "clarification");
    if (result.kind === "clarification") {
      assert.ok(result.message.length > 0);
      assert.ok(result.suggestions.length > 0);
    }
  });

  it("ritorna sezioni da regexToolHints", () => {
    const allowed = [
      COWORK_TOOL_CATALOG.renew_agreements,
      COWORK_TOOL_CATALOG.extend_approved_requests
    ];
    const result = planner.regexFallbackInterpret(
      ["smartworking_agreements", "smartworking_requests"],
      ["renew_agreements", "extend_approved_requests"],
      allowed,
      5,
      "accordi e richieste",
      false,
      0
    );
    assert.equal(result.kind, "sections");
    if (result.kind === "sections") {
      assert.equal(result.sections.length, 2);
    }
  });

  it("formazione-only → sezioni se training_batch eseguibile", () => {
    const result = planner.regexFallbackInterpret(
      ["training"],
      ["training_batch"],
      [COWORK_TOOL_CATALOG.training_batch],
      8,
      "corso per tutti",
      false,
      0
    );
    assert.equal(result.kind, "sections");
    if (result.kind === "sections") {
      assert.equal(result.sections[0]?.tool, "training_batch");
    }
  });
});
