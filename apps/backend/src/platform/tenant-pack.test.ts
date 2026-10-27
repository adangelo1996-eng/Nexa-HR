import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyActivityTemplate,
  capabilityForNexaApiPath,
  capabilityForNexaRoute,
  defaultTenantPack,
  getTenantPackCatalog,
  intakeToApplyInput,
  isCapabilityEnabled
} from "@payday/domain";

describe("tenant pack SYN-246", () => {
  it("catalogo espone capability always-on e template senza fork", () => {
    const catalog = getTenantPackCatalog();
    assert.equal(catalog.version, 1);
    assert.ok(catalog.capabilities.some((c) => c.id === "nexa.people" && c.kind === "always_on"));
    assert.ok(catalog.capabilities.some((c) => c.id === "plasticity.pl" && c.kind === "optional"));
    const ids = catalog.templates.map((t) => t.id);
    assert.deepEqual(ids, [
      "full_suite",
      "professional_services",
      "retail_commerce",
      "manufacturing",
      "hospitality",
      "executive_bi"
    ]);
    assert.ok(catalog.customPolicy.requiresCustomException.length >= 4);
  });

  it("un cliente nuovo si configura da template senza toccare always-on", () => {
    const pack = applyActivityTemplate({ templateId: "executive_bi" });
    assert.equal(pack.modules["nexa.people"], true);
    assert.equal(pack.modules["nexa.attendance"], true);
    assert.equal(pack.modules["plasticity.import"], true);
    assert.equal(pack.modules["nexa.recruiting"], false);
    assert.equal(pack.modules["nexa.payroll"], false);
    assert.equal(pack.modules["plasticity.pl"], true);
    assert.equal(isCapabilityEnabled(pack, "nexa.recruiting"), false);
    assert.equal(isCapabilityEnabled(pack, "nexa.people"), true);
  });

  it("overlay accende solo moduli optional del catalogo", () => {
    const pack = applyActivityTemplate({
      templateId: "executive_bi",
      overlay: {
        modules: { "nexa.recruiting": true, "nexa.people": false, "nexa.unknown": true },
        anagrafiche: { extraFields: ["costCenter", "not_a_field"] },
        kpis: { nexa: ["headcount", "made_up"], plasticity: ["ebitda"] }
      }
    });
    assert.equal(pack.modules["nexa.people"], true);
    assert.equal(pack.modules["nexa.recruiting"], true);
    assert.deepEqual(pack.anagrafiche.extraFields, ["costCenter"]);
    assert.deepEqual(pack.kpis.nexa, ["headcount"]);
  });

  it("route e API mappano recruiting e payroll", () => {
    assert.equal(capabilityForNexaRoute("/recruiting/candidates"), "nexa.recruiting");
    assert.equal(capabilityForNexaApiPath("/api/payroll/simulate"), "nexa.payroll");
    assert.equal(capabilityForNexaRoute("/attendance"), null);
    assert.equal(capabilityForNexaApiPath("/api/auth/login"), null);
  });

  it("default senza riga DB è full_suite", () => {
    const pack = defaultTenantPack();
    assert.equal(pack.templateId, "full_suite");
    assert.equal(pack.modules["nexa.recruiting"], true);
    assert.equal(pack.modules["plasticity.cf"], true);
  });

  it("il questionario hospitality accende payroll e turni", () => {
    const input = intakeToApplyInput({
      sector: "hospitality",
      headcount: "up_to_150",
      shifts: true,
      payslips: true,
      expenses: false,
      hiring: false,
      remote: false,
      leaveApprover: "manager"
    });
    const pack = applyActivityTemplate(input);
    assert.equal(pack.templateId, "hospitality");
    assert.equal(pack.modules["nexa.payroll"], true);
    assert.equal(pack.modules["nexa.payslips"], true);
    assert.equal(pack.modules["nexa.scheduling"], true);
    assert.equal(pack.modules["nexa.expenses"], false);
    assert.equal(pack.modules["nexa.people"], true);
    assert.equal(pack.limits.maxEmployees, 150);
    assert.equal(pack.workflows.leaveApprover, "manager");
  });
});
