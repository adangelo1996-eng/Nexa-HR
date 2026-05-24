import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { HebbMateCapabilityId } from "./hebb-mate.types";

const MATE_PROPOSAL_TTL_MS = 60 * 60 * 1000;

export type HebbMateProposalStatus = "proposed" | "applied" | "cancelled" | "expired";

export type HebbMateStoredProposal = {
  proposalId: string;
  companyId: string;
  actorUserId: string;
  capability: HebbMateCapabilityId;
  status: HebbMateProposalStatus;
  message: string;
  subjectUserIds: string[];
  resolvedNames: string[];
  params: Record<string, unknown>;
  preview: unknown;
  requiresConfirm: boolean;
  createdAt: string;
  expiresAt: string;
};

@Injectable()
export class HebbMateProposalsStore {
  private readonly mem = new Map<string, HebbMateStoredProposal>();

  save(input: Omit<HebbMateStoredProposal, "proposalId" | "createdAt" | "expiresAt" | "status"> & {
    proposalId?: string;
    status?: HebbMateProposalStatus;
  }): HebbMateStoredProposal {
    const now = Date.now();
    const proposal: HebbMateStoredProposal = {
      proposalId: input.proposalId ?? randomUUID(),
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      capability: input.capability,
      status: input.status ?? "proposed",
      message: input.message,
      subjectUserIds: input.subjectUserIds,
      resolvedNames: input.resolvedNames,
      params: input.params,
      preview: input.preview,
      requiresConfirm: input.requiresConfirm,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + MATE_PROPOSAL_TTL_MS).toISOString()
    };
    this.mem.set(proposal.proposalId, proposal);
    this.pruneExpired();
    return proposal;
  }

  get(proposalId: string, companyId: string, actorUserId: string): HebbMateStoredProposal {
    this.pruneExpired();
    const row = this.mem.get(proposalId);
    if (!row || row.companyId !== companyId) {
      throw new NotFoundException("Proposta Mate non trovata");
    }
    if (row.actorUserId !== actorUserId) {
      throw new BadRequestException("Proposta Mate non accessibile");
    }
    if (row.status !== "proposed") {
      throw new BadRequestException(`Proposta già ${row.status}`);
    }
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      row.status = "expired";
      throw new BadRequestException("Proposta Mate scaduta");
    }
    return row;
  }

  markApplied(proposalId: string): void {
    const row = this.mem.get(proposalId);
    if (row) {
      row.status = "applied";
    }
  }

  markCancelled(proposalId: string): void {
    const row = this.mem.get(proposalId);
    if (row) {
      row.status = "cancelled";
    }
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [id, row] of this.mem) {
      if (new Date(row.expiresAt).getTime() < now && row.status === "proposed") {
        row.status = "expired";
      }
      if (new Date(row.expiresAt).getTime() + MATE_PROPOSAL_TTL_MS < now) {
        this.mem.delete(id);
      }
    }
  }
}
