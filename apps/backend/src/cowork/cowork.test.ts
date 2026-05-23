import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COWORK_TOOL_CATALOG } from "./cowork.constants";
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
});

describe("cowork tool catalog", () => {
  it("espone tool eseguibili per i tre domini operativi", () => {
    assert.ok(COWORK_TOOL_CATALOG.renew_agreements.executable);
    assert.ok(COWORK_TOOL_CATALOG.extend_approved_requests.executable);
    assert.ok(COWORK_TOOL_CATALOG.update_contract_sw_clause.executable);
    assert.equal(COWORK_TOOL_CATALOG.training_batch.executable, false);
  });
});

describe("cowork planner regex fallback", () => {
  const planner = Object.create(CoworkPlannerService.prototype) as CoworkPlannerService;

  it("ritorna chiarimento per unknown senza LLM", () => {
    const result = planner.regexFallbackInterpret(["unknown"], 10, "fai qualcosa di vago", false, 0);
    assert.equal(result.kind, "clarification");
    if (result.kind === "clarification") {
      assert.ok(result.message.length > 0);
      assert.ok(result.suggestions.length > 0);
    }
  });

  it("ritorna sezioni multiple da regexDomains", () => {
    const result = planner.regexFallbackInterpret(
      ["smartworking_agreements", "smartworking_requests"],
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

  it("formazione-only → chiarimento in arrivo", () => {
    const result = planner.regexFallbackInterpret(["training"], 8, "corso per tutti", false, 0);
    assert.equal(result.kind, "clarification");
  });
});
