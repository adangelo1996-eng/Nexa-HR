import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HrDataStore } from "../platform/hr-data.store";

describe("HrDataStore vault signature workflow", () => {
  it("publish revision contract → pending → sign → returned", async () => {
    const store = new HrDataStore();
    const original = await store.createEmployeeDocument({
      userId: "u-employee",
      uploadedBy: "u-manager",
      kind: "contract",
      title: "Contratto 2024",
      bodyBase64: Buffer.from("pdf-old").toString("base64")
    });

    const revision = await store.createEmployeeDocument({
      userId: "u-employee",
      uploadedBy: "u-manager",
      kind: "contract",
      title: "Contratto 2025",
      parentDocumentId: original.id,
      bodyBase64: Buffer.from("pdf-new").toString("base64")
    });
    assert.equal(revision.parentDocumentId, original.id);

    const pending = await store.listVaultSignatureRequestsForEmployee(
      "u-employee",
      "pending_employee_sign"
    );
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.documentId, revision.id);
    assert.equal(pending[0]?.requesterUserId, "u-manager");

    const result = await store.signVaultDocument({
      documentId: revision.id,
      actorUserId: "u-employee",
      employeeSignerName: "Dipendente Demo"
    });
    assert.ok(result.document.signedAt);
    assert.equal(result.request.status, "returned");
    assert.ok(result.request.returnedAt);

    const hrReturns = await store.listVaultSignatureRequestsForRequester("u-manager", "returned");
    assert.ok(hrReturns.some((r) => r.documentId === revision.id));

    const stillPending = await store.listVaultSignatureRequestsForEmployee(
      "u-employee",
      "pending_employee_sign"
    );
    assert.equal(stillPending.length, 0);
  });

  it("revisione payslip senza firma precedente non crea richiesta", async () => {
    const store = new HrDataStore();
    const original = await store.createEmployeeDocument({
      userId: "u-employee",
      uploadedBy: "u-manager",
      kind: "payslip",
      title: "Cedolino Gen"
    });
    await store.createEmployeeDocument({
      userId: "u-employee",
      uploadedBy: "u-manager",
      kind: "payslip",
      title: "Cedolino Gen (corretto)",
      parentDocumentId: original.id
    });
    const pending = await store.listVaultSignatureRequestsForEmployee("u-employee");
    assert.equal(pending.length, 0);
  });

  it("revisione other dopo parent firmato crea richiesta", async () => {
    const store = new HrDataStore();
    const original = await store.createEmployeeDocument({
      userId: "u-employee",
      uploadedBy: "u-manager",
      kind: "other",
      title: "Policy firmata"
    });
    const mem = (store as unknown as { employeeDocuments: Array<{ id: string; signedAt?: string }> })
      .employeeDocuments;
    mem.find((d) => d.id === original.id)!.signedAt = "2026-05-01T00:00:00.000Z";

    await store.createEmployeeDocument({
      userId: "u-employee",
      uploadedBy: "u-manager",
      kind: "other",
      title: "Policy aggiornata",
      parentDocumentId: original.id
    });
    const pending = await store.listVaultSignatureRequestsForEmployee(
      "u-employee",
      "pending_employee_sign"
    );
    assert.equal(pending.length, 1);
  });
});
