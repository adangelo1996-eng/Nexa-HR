import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AuthContext } from "../platform/auth";
import { AiOpenAiRefinementService } from "../ai-hr/ai-openai-refinement.service";
import { AiPrivacyGateway } from "../ai-privacy/ai-privacy-gateway.service";
import { TokenVaultService } from "../ai-privacy/token-vault.service";
import { HrContractsService } from "../hr-contracts/hr-contracts.service";
import { HrDataStore } from "../platform/hr-data.store";
import { PermissionsService } from "../platform/permissions.service";
import { HrCenterService } from "./hr-center.service";

function authSuperuser(): AuthContext {
  return {
    userId: "u-admin",
    tenantId: "comp-1",
    role: "superuser"
  };
}

describe("HrCenterService.runAnalytics", () => {
  it("restituisce dataset e report senza campo legacy facts", async () => {
    const store = new HrDataStore();
    const permissions = new PermissionsService(store);
    const vault = new TokenVaultService();
    const gateway = new AiPrivacyGateway(vault);
    const openAi = new AiOpenAiRefinementService();
    const hrContracts = {} as unknown as HrContractsService;
    const svc = new HrCenterService(store, permissions, gateway, openAi, hrContracts);

    const out = await svc.runAnalytics(authSuperuser(), {});
    assert.ok("dataset" in out && out.dataset != null);
    assert.ok("report" in out && out.report != null);
    assert.equal((out as { facts?: unknown }).facts, undefined);
    assert.ok(out.dataset.totals.headcount >= 1);
    assert.equal(out.dataset.analysisFocus, "company");
    assert.ok(typeof out.dataset.analysisLabel === "string" && out.dataset.analysisLabel.length > 3);
    const rep = out.report as { envelope?: { executiveSummary?: string } };
    assert.ok(rep.envelope?.executiveSummary && rep.envelope.executiveSummary.length > 20);
  });
});
