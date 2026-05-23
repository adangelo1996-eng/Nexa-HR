import type { EmployeeDocument, EmployeeDocumentKind } from "@payday/domain";

/** Tipologie vault che richiedono sempre ri-firma dipendente su revisione HITL. */
export const VAULT_KINDS_REQUIRING_SIGNATURE: EmployeeDocumentKind[] = ["contract"];

export function vaultKindRequiresEmployeeSignature(kind: EmployeeDocumentKind): boolean {
  return VAULT_KINDS_REQUIRING_SIGNATURE.includes(kind);
}

export function isVaultDocumentSigned(
  doc: Pick<EmployeeDocument, "signedAt" | "signatureMetadata">
): boolean {
  if (doc.signedAt?.trim()) return true;
  const meta = doc.signatureMetadata;
  return Boolean(meta && typeof meta === "object" && Object.keys(meta).length > 0);
}

/** Risale la catena parent fino al primo documento già firmato. */
export function findSignedAncestorId(
  startDocumentId: string,
  documentsById: Map<string, EmployeeDocument>
): string | undefined {
  let curId: string | undefined = startDocumentId;
  const seen = new Set<string>();
  while (curId && !seen.has(curId)) {
    seen.add(curId);
    const cur = documentsById.get(curId);
    if (!cur) break;
    if (isVaultDocumentSigned(cur)) return cur.id;
    curId = cur.parentDocumentId;
  }
  return undefined;
}

export function shouldCreateVaultSignatureRequest(input: {
  newDocumentKind: EmployeeDocumentKind;
  parentDocument?: EmployeeDocument;
  documentsById: Map<string, EmployeeDocument>;
}): boolean {
  if (vaultKindRequiresEmployeeSignature(input.newDocumentKind)) return true;
  if (!input.parentDocument) return false;
  return Boolean(findSignedAncestorId(input.parentDocument.id, input.documentsById));
}
