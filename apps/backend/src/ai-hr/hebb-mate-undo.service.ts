import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthContext } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { HrContractsService } from "../hr-contracts/hr-contracts.service";
import type { HebbMateApplyLogEntry } from "./hebb-mate-apply-log.store";
import { HebbMateApplyLogStore } from "./hebb-mate-apply-log.store";

const NON_REVERSIBLE_CAPABILITIES = new Set(["document_email", "cv_screening", "automation_proposals"]);

@Injectable()
export class HebbMateUndoService {
  constructor(
    private readonly store: HrDataStore,
    private readonly applyLog: HebbMateApplyLogStore,
    private readonly contracts: HrContractsService
  ) {}

  assertSuperuser(auth: AuthContext): void {
    if (auth.role !== "superuser") {
      throw new ForbiddenException("Solo superuser può annullare operazioni Mate.");
    }
  }

  isCapabilityReversible(capability: string): { reversible: boolean; reason?: string } {
    if (NON_REVERSIBLE_CAPABILITIES.has(capability)) {
      return {
        reversible: false,
        reason: "Notifiche email e screening CV non sono reversibili automaticamente"
      };
    }
    return { reversible: true };
  }

  buildUndoMeta(capability: string): Pick<HebbMateApplyLogEntry, "undoStatus" | "undoBlockedReason"> {
    const check = this.isCapabilityReversible(capability);
    if (!check.reversible) {
      return { undoStatus: "blocked", undoBlockedReason: check.reason ?? "Non reversibile" };
    }
    return { undoStatus: "available", undoBlockedReason: null };
  }

  async undo(auth: AuthContext, logId: string): Promise<{ ok: boolean; logId: string; message: string }> {
    this.assertSuperuser(auth);
    const me = await this.store.getUser(auth.userId);
    const companyId = me.companyId;

    const entry = await this.applyLog.getById(logId, companyId);
    if (!entry) {
      throw new NotFoundException("Voce di log Mate non trovata");
    }
    if (entry.undoStatus === "undone") {
      throw new BadRequestException("Operazione già annullata");
    }
    if (entry.undoStatus === "blocked") {
      throw new BadRequestException(entry.undoBlockedReason ?? "Operazione non reversibile");
    }
    if (entry.undoStatus === "failed") {
      throw new BadRequestException(entry.undoBlockedReason ?? "Undo precedente fallito");
    }

    const reversibility = this.isCapabilityReversible(entry.capability);
    if (!reversibility.reversible) {
      throw new BadRequestException(reversibility.reason ?? "Operazione non reversibile");
    }

    try {
      await this.reverseEntry(companyId, entry);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.applyLog.markFailed(entry.id, companyId, msg);
      throw new BadRequestException(`Undo non riuscito: ${msg}`);
    }

    await this.applyLog.markUndone(entry.id, companyId, auth.userId);
    return { ok: true, logId: entry.id, message: "Operazione Mate annullata" };
  }

  private async reverseEntry(companyId: string, entry: HebbMateApplyLogEntry): Promise<void> {
    if (entry.capability === "contract_generation" && entry.entityType === "contract" && entry.entityId) {
      await this.contracts.delete(companyId, entry.entityId);
      if (entry.appliedPayload.documentId && typeof entry.appliedPayload.documentId === "string") {
        await this.deleteEmployeeDocument(entry.appliedPayload.documentId);
      }
      return;
    }

    if (entry.capability === "document_generation" && entry.entityType === "employee_document" && entry.entityId) {
      await this.deleteEmployeeDocument(entry.entityId);
      return;
    }

    throw new BadRequestException(`Undo non supportato per capability ${entry.capability}`);
  }

  private async deleteEmployeeDocument(documentId: string): Promise<void> {
    const sb = this.store.getServiceRoleClient();
    const { error } = await sb.from("employee_documents").delete().eq("id", documentId);
    if (error) {
      throw new BadRequestException(error.message);
    }
  }
}
