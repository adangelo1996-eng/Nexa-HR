import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CoworkOrchestratorService } from "./cowork-orchestrator.service";

describe("cowork domain classification", () => {
  const svc = Object.create(CoworkOrchestratorService.prototype) as CoworkOrchestratorService;

  it("prioritizza accordi su richieste e contratti", () => {
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
});
