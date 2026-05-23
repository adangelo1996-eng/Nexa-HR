import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EmployeeDocument } from "@payday/domain";
import {
  findSignedAncestorId,
  isVaultDocumentSigned,
  shouldCreateVaultSignatureRequest,
  vaultKindRequiresEmployeeSignature
} from "./document-signature-workflow.util";

function doc(
  partial: Partial<EmployeeDocument> & Pick<EmployeeDocument, "id" | "kind">
): EmployeeDocument {
  return {
    userId: "u1",
    title: partial.title ?? "T",
    createdAt: "2026-01-01",
    ...partial
  };
}

describe("document-signature-workflow.util", () => {
  it("contract richiede firma", () => {
    assert.equal(vaultKindRequiresEmployeeSignature("contract"), true);
    assert.equal(vaultKindRequiresEmployeeSignature("payslip"), false);
  });

  it("rileva documento firmato", () => {
    assert.equal(isVaultDocumentSigned(doc({ id: "a", kind: "other" })), false);
    assert.equal(
      isVaultDocumentSigned(doc({ id: "b", kind: "other", signedAt: "2026-05-01T00:00:00.000Z" })),
      true
    );
  });

  it("risale catena parent al firmato", () => {
    const map = new Map<string, EmployeeDocument>([
      ["c3", doc({ id: "c3", kind: "other", parentDocumentId: "c2" })],
      ["c2", doc({ id: "c2", kind: "other", parentDocumentId: "c1" })],
      ["c1", doc({ id: "c1", kind: "contract", signedAt: "2026-01-01" })]
    ]);
    assert.equal(findSignedAncestorId("c3", map), "c1");
  });

  it("shouldCreate: kind contract o antenato firmato", () => {
    const map = new Map<string, EmployeeDocument>([
      ["p", doc({ id: "p", kind: "personal" })],
      ["c", doc({ id: "c", kind: "other", parentDocumentId: "p", signedAt: "2026-02-01" })]
    ]);
    assert.equal(
      shouldCreateVaultSignatureRequest({
        newDocumentKind: "personal",
        parentDocument: map.get("c")!,
        documentsById: map
      }),
      true
    );
    assert.equal(
      shouldCreateVaultSignatureRequest({
        newDocumentKind: "personal",
        parentDocument: map.get("p")!,
        documentsById: map
      }),
      false
    );
    assert.equal(
      shouldCreateVaultSignatureRequest({
        newDocumentKind: "contract",
        parentDocument: map.get("p")!,
        documentsById: map
      }),
      true
    );
  });
});
