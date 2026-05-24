import {
  routeHebbMateIntent,
  extractContractKind,
  extractDocumentKind,
  isHebbMateSuggestionIntent
} from "./hebb-mate-router";

describe("hebb-mate-router", () => {
  it("routes contract generation", () => {
    expect(routeHebbMateIntent("Genera contratto di lavoro per il team")).toBe("contract_generation");
    expect(extractContractKind("accordo smart working")).toBe("remote_working");
  });

  it("routes cv screening", () => {
    expect(routeHebbMateIntent("Screening CV candidato")).toBe("cv_screening");
  });

  it("routes automation", () => {
    expect(routeHebbMateIntent("Suggerisci automazioni mensili")).toBe("automation_proposals");
  });

  it("respects explicit capability", () => {
    expect(routeHebbMateIntent("hello", "reports")).toBe("reports");
  });

  it("extracts document kind", () => {
    expect(extractDocumentKind("attestato formazione")).toBe("certificate_training");
  });

  it("detects suggestion intent without routing to automation", () => {
    expect(isHebbMateSuggestionIntent("cosa posso fare?")).toBe(true);
    expect(isHebbMateSuggestionIntent("dammi suggerimenti")).toBe(true);
    expect(routeHebbMateIntent("cosa posso fare?")).toBe("general");
    expect(routeHebbMateIntent("Suggerisci automazioni mensili")).toBe("automation_proposals");
  });
});
