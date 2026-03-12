// src/sync/sync.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SyncEntity, SyncOpDto, SyncOpType } from "./dto/sync.dto";
import cloudinary from "../cloudinary/cloudinary.config";

type PushResult = {
  applied: string[]; // entityIds
  ignored: string[]; // entityIds
  failed: Array<{ entityId: string; reason: string }>;
  appliedOpIds: string[];
  ignoredOpIds: string[];
  serverTime: string;
};

@Injectable()
export class SyncService {
  constructor(private prisma: PrismaService) {}

  /**
   * Push client changes (outbox) to server
   * - safe to retry (idempotent)
   * - conflict rule: last-write-wins based on clientUpdatedAt (fallback: payload.updatedAt)
   */
  async push(
    userId: string,
    deviceId: string,
    ops: SyncOpDto[],
  ): Promise<PushResult> {
    const applied: string[] = [];
    const ignored: string[] = [];
    const failed: Array<{ entityId: string; reason: string }> = [];
    const appliedOpIds: string[] = [];
    const ignoredOpIds: string[] = [];

    for (const op of ops) {
      try {
        if (!op.payload?.id) {
          throw new BadRequestException("payload.id is required");
        }
        if (op.entityId !== op.payload.id) {
          throw new BadRequestException("entityId must match payload.id");
        }

        // entity+op specific validation
        this.validatePayload(op);

        // --- Route by entity/op (TRANSACTION logic preserved) ---
        if (op.entity === SyncEntity.TRANSACTION) {
          if (op.op === SyncOpType.DELETE) {
            const deleteTs = this.parseClientTs(op.payload);
            const res = await this.applyDeleteTransaction(
              userId,
              deviceId,
              op.entityId,
              deleteTs,
            );
            if (res === "applied") {
              applied.push(op.entityId);
              appliedOpIds.push(op.opId);
            } else {
              ignored.push(op.entityId);
              ignoredOpIds.push(op.opId);
            }
            continue;
          }

          if (op.op === SyncOpType.UPSERT) {
            const res = await this.applyUpsertTransaction(
              userId,
              deviceId,
              op.payload,
            );
            if (res === "applied") {
              applied.push(op.entityId);
              appliedOpIds.push(op.opId);
            } else {
              ignored.push(op.entityId);
              ignoredOpIds.push(op.opId);
            }
            continue;
          }

          throw new BadRequestException(`Unsupported op: ${op.op}`);
        }

        if (op.entity === SyncEntity.CONTACT) {
          if (op.op === SyncOpType.DELETE) {
            const ts = this.parseClientTs(op.payload);
            const res = await this.applyDeleteContact(
              userId,
              deviceId,
              op.entityId,
              ts,
            );
            if (res === "applied") {
              applied.push(op.entityId);
              appliedOpIds.push(op.opId);
            } else {
              ignored.push(op.entityId);
              ignoredOpIds.push(op.opId);
            }
            continue;
          }

          if (op.op === SyncOpType.UPSERT) {
            const res = await this.applyUpsertContact(
              userId,
              deviceId,
              op.payload,
            );
            if (res === "applied") {
              applied.push(op.entityId);
              appliedOpIds.push(op.opId);
            } else {
              ignored.push(op.entityId);
              ignoredOpIds.push(op.opId);
            }
            continue;
          }

          throw new BadRequestException(`Unsupported op: ${op.op}`);
        }

        if (op.entity === SyncEntity.CATEGORY) {
          if (op.op === SyncOpType.DELETE) {
            const ts = this.parseClientTs(op.payload);
            const res = await this.applyDeleteCategory(
              userId,
              deviceId,
              op.entityId,
              ts,
            );
            if (res === "applied") {
              applied.push(op.entityId);
              appliedOpIds.push(op.opId);
            } else {
              ignored.push(op.entityId);
              ignoredOpIds.push(op.opId);
            }
            continue;
          }

          if (op.op === SyncOpType.UPSERT) {
            const res = await this.applyUpsertCategory(
              userId,
              deviceId,
              op.payload,
            );
            if (res === "applied") {
              applied.push(op.entityId);
              appliedOpIds.push(op.opId);
            } else {
              ignored.push(op.entityId);
              ignoredOpIds.push(op.opId);
            }
            continue;
          }

          throw new BadRequestException(`Unsupported op: ${op.op}`);
        }

        throw new BadRequestException(`Unsupported entity: ${op.entity}`);
      } catch (e: any) {
        failed.push({
          entityId: op.entityId,
          reason: e?.message ?? "Unknown error",
        });
      }
    }

    return {
      applied,
      ignored,
      failed,
      appliedOpIds,
      ignoredOpIds,
      serverTime: new Date().toISOString(),
    };
  }

  /**
   * Pull server changes since timestamp
   * - returns updated + tombstones
   * - keeps TRANSACTION response intact, and adds contacts/categories
   */
  async pull(userId: string, sinceIso?: string, limit = 500) {
    const since = sinceIso ? new Date(sinceIso) : new Date(0);
    if (Number.isNaN(since.getTime())) {
      throw new BadRequestException(
        "since must be a valid ISO 8601 date string",
      );
    }

    const safeLimit = Math.min(Math.max(limit || 500, 1), 2000);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        OR: [{ updatedAt: { gt: since } }, { deletedAt: { gt: since } }],
      },
      orderBy: { updatedAt: "desc" },
      take: safeLimit,
      include: { splits: true },
    });

    const contacts = await this.prisma.contact.findMany({
      where: {
        userId,
        OR: [{ updatedAt: { gt: since } }, { deletedAt: { gt: since } }],
      },
      orderBy: { updatedAt: "desc" },
      take: safeLimit,
    });

    // user categories only (defaults handled separately)
    const categories = await this.prisma.category.findMany({
      where: {
        userId,
        isDefault: false,
        OR: [{ updatedAt: { gt: since } }, { deletedAt: { gt: since } }],
      },
      orderBy: { updatedAt: "desc" },
      take: safeLimit,
    });

    // defaults always (not synced via push)
    const defaultCategories = await this.prisma.category.findMany({
      where: { isDefault: true, userId: null, deletedAt: null },
      orderBy: { name: "asc" },
    });

    return {
      serverTime: new Date().toISOString(),
      transactions,
      contacts,
      categories,
      defaultCategories,
    };
  }

  // -------------------------
  // TRANSACTION UPSERT (UNCHANGED)
  // -------------------------
  private async applyUpsertTransaction(
    userId: string,
    deviceId: string,
    payload: any,
  ): Promise<"applied" | "ignored"> {
    const incomingClientUpdatedAt = this.parseClientTs(payload);

    const existing = await this.prisma.transaction.findUnique({
      where: { id: payload.id },
      include: { splits: true },
    });

    if (existing && existing.userId !== userId) {
      throw new ForbiddenException();
    }

    const existingTs =
      existing?.clientUpdatedAt ?? existing?.updatedAt ?? new Date(0);

    if (existing && incomingClientUpdatedAt <= existingTs) {
      return "ignored";
    }

    const isDeletedOnServer = !!existing?.deletedAt;
    if (
      existing &&
      isDeletedOnServer &&
      incomingClientUpdatedAt <= existingTs
    ) {
      return "ignored";
    }

    if (
      existing?.receiptPublicId &&
      (payload.receiptPublicId === null ||
        payload.receiptPublicId !== existing.receiptPublicId)
    ) {
      await this.safeDestroyCloudinary(existing.receiptPublicId);
    }

    const baseData: any = {
      userId,
      title: payload.title,
      amount: payload.amount,
      type: payload.type,
      category: payload.category,
      date: new Date(payload.date),
      dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
      isPaid: payload.isPaid ?? true,
      reminderDismissedAt: payload.reminderDismissedAt
        ? new Date(payload.reminderDismissedAt)
        : null,

      clientName: payload.clientName ?? null,
      projectTitle: payload.projectTitle ?? null,
      notes: payload.notes ?? null,
      tags: payload.tags ?? [],
      receiptImage: payload.receiptImage ?? null,
      receiptPublicId: payload.receiptPublicId ?? null,

      clientUpdatedAt: incomingClientUpdatedAt,

      // preserve tombstone unless restore logic is needed
      deletedAt: existing?.deletedAt ?? null,
      deletedByDeviceId: existing?.deletedByDeviceId ?? null,
    };

    if (Number.isNaN(baseData.date.getTime())) {
      throw new BadRequestException(
        "payload.date must be a valid ISO 8601 date string",
      );
    }
    if (baseData.dueDate && Number.isNaN(baseData.dueDate.getTime())) {
      throw new BadRequestException(
        "payload.dueDate must be a valid ISO 8601 date string",
      );
    }

    const safeSplits = await this.filterSplitsByExistingContacts(
      userId,
      payload.splits,
    );

    const splitsCreate =
      Array.isArray(safeSplits) && safeSplits.length
        ? {
            createMany: {
              data: safeSplits.map((s: any) => ({
                participantId: s.participantId,
                amount: s.amount,
                isPaid: s.isPaid ?? false,
              })),
            },
          }
        : undefined;

    const splitsReplace = Array.isArray(safeSplits)
      ? {
          deleteMany: {},
          createMany: {
            data: safeSplits.map((s: any) => ({
              participantId: s.participantId,
              amount: s.amount,
              isPaid: s.isPaid ?? false,
            })),
          },
        }
      : undefined;

    if (!existing) {
      const createdAt = payload.createdAt
        ? new Date(payload.createdAt)
        : new Date();
      if (Number.isNaN(createdAt.getTime())) {
        throw new BadRequestException(
          "payload.createdAt must be a valid ISO 8601 date string",
        );
      }

      await this.prisma.transaction.create({
        data: {
          id: payload.id,
          ...baseData,
          createdAt,
          ...(splitsCreate ? { splits: splitsCreate } : {}),
        },
      });

      return "applied";
    }

    await this.prisma.transaction.update({
      where: { id: payload.id },
      data: {
        ...baseData,
        ...(splitsReplace ? { splits: splitsReplace } : {}),
      },
    });

    return "applied";
  }

  // -------------------------
  // TRANSACTION DELETE (UNCHANGED)
  // -------------------------
  private async applyDeleteTransaction(
    userId: string,
    deviceId: string,
    id: string,
    clientTs: Date,
  ): Promise<"applied" | "ignored"> {
    const existing = await this.prisma.transaction.findUnique({
      where: { id },
    });
    if (!existing) return "ignored";
    if (existing.userId !== userId) throw new ForbiddenException();

    const existingTs =
      existing.clientUpdatedAt ?? existing.updatedAt ?? new Date(0);
    if (clientTs < existingTs) return "ignored";

    if (existing.receiptPublicId) {
      await this.safeDestroyCloudinary(existing.receiptPublicId);
    }

    await this.prisma.transaction.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedByDeviceId: deviceId,
        clientUpdatedAt: clientTs,
      },
    });

    return "applied";
  }

  // -------------------------
  // CONTACT UPSERT
  // -------------------------
  private async applyUpsertContact(
    userId: string,
    deviceId: string,
    payload: any,
  ): Promise<"applied" | "ignored"> {
    const incomingTs = this.parseClientTs(payload);

    const existing = await this.prisma.contact.findUnique({
      where: { id: payload.id },
    });

    if (existing && existing.userId !== userId) {
      throw new ForbiddenException();
    }

    const existingTs =
      existing?.clientUpdatedAt ?? existing?.updatedAt ?? new Date(0);

    if (existing && incomingTs <= existingTs) {
      return "ignored";
    }

    const baseData: any = {
      userId,
      name: payload.name,
      clientUpdatedAt: incomingTs,

      // preserve tombstone by default (no resurrection unless you want it)
      deletedAt: existing?.deletedAt ?? null,
      deletedByDeviceId: existing?.deletedByDeviceId ?? null,
    };

    if (!existing) {
      const createdAt = payload.createdAt
        ? new Date(payload.createdAt)
        : new Date();
      if (Number.isNaN(createdAt.getTime())) {
        throw new BadRequestException(
          "payload.createdAt must be a valid ISO 8601 date string",
        );
      }

      await this.prisma.contact.create({
        data: {
          id: payload.id,
          ...baseData,
          createdAt,
        },
      });
      return "applied";
    }

    await this.prisma.contact.update({
      where: { id: payload.id },
      data: baseData,
    });

    return "applied";
  }

  // -------------------------
  // CONTACT DELETE (tombstone)
  // -------------------------
  private async applyDeleteContact(
    userId: string,
    deviceId: string,
    id: string,
    clientTs: Date,
  ): Promise<"applied" | "ignored"> {
    const existing = await this.prisma.contact.findUnique({ where: { id } });
    if (!existing) return "ignored";
    if (existing.userId !== userId) throw new ForbiddenException();

    const existingTs =
      existing.clientUpdatedAt ?? existing.updatedAt ?? new Date(0);
    if (clientTs < existingTs) return "ignored";

    await this.prisma.contact.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedByDeviceId: deviceId,
        clientUpdatedAt: clientTs,
      },
    });

    return "applied";
  }

  // -------------------------
  // CATEGORY UPSERT (user categories only)
  // -------------------------
  private async applyUpsertCategory(
    userId: string,
    deviceId: string,
    payload: any,
  ): Promise<"applied" | "ignored"> {
    const incomingTs = this.parseClientTs(payload);

    const existing = await this.prisma.category.findUnique({
      where: { id: payload.id },
    });

    // If it exists and belongs to someone else, forbid
    if (existing && existing.userId && existing.userId !== userId) {
      throw new ForbiddenException();
    }

    // Do not allow sync to modify defaults
    if (existing?.isDefault || payload?.isDefault === true) {
      // treat as ignored (safe)
      return "ignored";
    }

    const existingTs =
      existing?.clientUpdatedAt ?? existing?.updatedAt ?? new Date(0);

    if (existing && incomingTs <= existingTs) {
      return "ignored";
    }

    const baseData: any = {
      // user-owned category
      userId,
      isDefault: false,

      name: payload.name,
      iconName: payload.iconName,
      color: payload.color,

      clientUpdatedAt: incomingTs,

      deletedAt: existing?.deletedAt ?? null,
      deletedByDeviceId: existing?.deletedByDeviceId ?? null,
    };

    if (!existing) {
      const createdAt = payload.createdAt
        ? new Date(payload.createdAt)
        : new Date();
      if (Number.isNaN(createdAt.getTime())) {
        throw new BadRequestException(
          "payload.createdAt must be a valid ISO 8601 date string",
        );
      }

      await this.prisma.category.create({
        data: {
          id: payload.id,
          ...baseData,
          createdAt,
        },
      });
      return "applied";
    }

    await this.prisma.category.update({
      where: { id: payload.id },
      data: baseData,
    });

    return "applied";
  }

  // -------------------------
  // CATEGORY DELETE (tombstone)
  // -------------------------
  private async applyDeleteCategory(
    userId: string,
    deviceId: string,
    id: string,
    clientTs: Date,
  ): Promise<"applied" | "ignored"> {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) return "ignored";

    // don't delete defaults via sync
    if (existing.isDefault) return "ignored";

    if (existing.userId !== userId) throw new ForbiddenException();

    const existingTs =
      existing.clientUpdatedAt ?? existing.updatedAt ?? new Date(0);
    if (clientTs < existingTs) return "ignored";

    await this.prisma.category.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedByDeviceId: deviceId,
        clientUpdatedAt: clientTs,
      },
    });

    return "applied";
  }

  /**
   * Parse client timestamp from payload
   * Accepts payload.clientUpdatedAt first, else payload.updatedAt, else now
   */
  private parseClientTs(payload: any): Date {
    const raw = payload?.clientUpdatedAt ?? payload?.updatedAt;
    const dt = raw ? new Date(raw) : new Date();
    if (Number.isNaN(dt.getTime())) {
      throw new BadRequestException(
        "clientUpdatedAt/updatedAt must be a valid ISO 8601 date string",
      );
    }
    return dt;
  }

  /**
   * Prevent sync failures when splits reference contacts that don't exist on server.
   */
  private async filterSplitsByExistingContacts(userId: string, splits: any) {
    if (!Array.isArray(splits) || splits.length === 0) return [];

    const ids = Array.from(
      new Set(
        splits
          .map((s: any) => s?.participantId)
          .filter((x: any) => typeof x === "string" && x.length > 0),
      ),
    );

    if (!ids.length) return [];

    const contacts = await this.prisma.contact.findMany({
      where: { userId, id: { in: ids }, deletedAt: null },
      select: { id: true },
    });

    const allowed = new Set(contacts.map((c) => c.id));
    return splits.filter((s: any) => allowed.has(s.participantId));
  }

  private async safeDestroyCloudinary(publicId: string) {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch {
      // ignore for idempotency
    }
  }

  /**
   * Validate payload based on entity + op
   * (keeps your transaction validation intact)
   */
  private validatePayload(op: SyncOpDto) {
    if (op.op === SyncOpType.DELETE) {
      if (!op.payload?.id) {
        throw new BadRequestException("DELETE payload.id required");
      }
      // timestamp optional but recommended
      return;
    }

    if (op.op === SyncOpType.UPSERT) {
      const p = op.payload;

      if (op.entity === SyncEntity.TRANSACTION) {
        const required = ["id", "title", "amount", "type", "category", "date"];
        for (const k of required) {
          if (p?.[k] === undefined || p?.[k] === null || p?.[k] === "") {
            throw new BadRequestException(`UPSERT payload.${k} required`);
          }
        }
        return;
      }

      if (op.entity === SyncEntity.CONTACT) {
        const required = ["id", "name"];
        for (const k of required) {
          if (p?.[k] === undefined || p?.[k] === null || p?.[k] === "") {
            throw new BadRequestException(`UPSERT payload.${k} required`);
          }
        }
        return;
      }

      if (op.entity === SyncEntity.CATEGORY) {
        const required = ["id", "name", "iconName", "color"];
        for (const k of required) {
          if (p?.[k] === undefined || p?.[k] === null || p?.[k] === "") {
            throw new BadRequestException(`UPSERT payload.${k} required`);
          }
        }
        return;
      }

      throw new BadRequestException(`Unsupported entity: ${op.entity}`);
    }

    throw new BadRequestException(`Unsupported op: ${op.op}`);
  }
}
