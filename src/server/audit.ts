import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AuditAction, AuditEntityType } from "@/domain/audit-actions";
import type { Tx } from "./db";

export interface AuditRecord {
  workspaceId: string;
  actorId: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  requestId?: string | null;
  ipHash?: string | null;
  details?: Prisma.InputJsonObject;
}

/**
 * The only write path for audit rows. There is deliberately no update or delete
 * counterpart anywhere in the codebase. Call it inside the same transaction as
 * the mutation it describes.
 */
export async function recordAudit(tx: Tx, record: AuditRecord): Promise<void> {
  await tx.auditEvent.create({
    data: {
      workspaceId: record.workspaceId,
      actorId: record.actorId,
      action: record.action,
      entityType: record.entityType,
      entityId: record.entityId,
      requestId: record.requestId ?? null,
      ipHash: record.ipHash ?? null,
      details: record.details,
    },
  });
}
