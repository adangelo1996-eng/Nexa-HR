import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAutomationCatalogById,
  HEBB_MATE_DEFAULT_MONTHLY_HR_CATALOG_IDS,
  selectAutomationProposalsFromCatalog
} from "./hebb-mate-automation-catalog";

describe("hebb-mate-automation-catalog", () => {
  it("returns monthly HR bundle for generic automation request", () => {
    const proposals = selectAutomationProposalsFromCatalog({
      message: "Suggerisci automazioni mensili per HR"
    });
    assert.ok(proposals.length >= 5);
    assert.ok(proposals.some((p) => p.catalogId === "attendance_anomaly_daily"));
    assert.ok(proposals.some((p) => p.catalogId === "fixed_term_contract_expiry"));
    assert.ok(proposals.every((p) => p.actions && p.actions.length > 0));
  });

  it("matches timbrature-specific automation", () => {
    const proposals = selectAutomationProposalsFromCatalog({
      message: "Controllo timbrature e anomalie ingresso uscita"
    });
    assert.equal(proposals[0]?.catalogId, "attendance_anomaly_daily");
    assert.equal(proposals[0]?.triggerType, "schedule");
  });

  it("matches contratti determinati", () => {
    const proposals = selectAutomationProposalsFromCatalog({
      message: "Alert contratti determinati in scadenza"
    });
    assert.ok(proposals.some((p) => p.catalogId === "fixed_term_contract_expiry"));
  });

  it("default monthly bundle ids are defined in catalog", () => {
    for (const id of HEBB_MATE_DEFAULT_MONTHLY_HR_CATALOG_IDS) {
      assert.ok(getAutomationCatalogById(id), `missing ${id}`);
    }
  });
});
