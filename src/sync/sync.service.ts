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
  applied: string[];
  ignored: string[];
  failed: Array<{ entityId: string; reason: string }>;
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
    ops: SyncOpDto[]
  ): Promise<PushResult> {
    const applied: string[] = [];
    const ignored: string[] = [];
    const failed: Array<{ entityId: string; reason: string }> = [];

    for (const op of ops) {
      try {
        if (op.entity !== SyncEntity.TRANSACTION) {
          throw new BadRequestException(`Unsupported entity: ${op.entity}`);
        }

        if (!op.payload?.id) {
          throw new BadRequestException("payload.id is required");
        }

        if (op.entityId !== op.payload.id) {
          throw new BadRequestException("entityId must match payload.id");
        }
        this.validatePayload(op);

        if (op.op === SyncOpType.DELETE) {
          // For now, your DTO sends updatedAt; later you can switch to clientUpdatedAt
          const deleteTs = this.parseClientTs(op.payload);
          const res = await this.applyDeleteTransaction(
            userId,
            deviceId,
            op.entityId,
            deleteTs
          );
          (res === "applied" ? applied : ignored).push(op.entityId);
          continue;
        }

        if (op.op === SyncOpType.UPSERT) {
          const res = await this.applyUpsertTransaction(
            userId,
            deviceId,
            op.payload
          );
          (res === "applied" ? applied : ignored).push(op.entityId);
          continue;
        }

        throw new BadRequestException(`Unsupported op: ${op.op}`);
      } catch (e: any) {
        failed.push({
          entityId: op.entityId,
          reason: e?.message ?? "Unknown error",
        });
      }
    }

    return { applied, ignored, failed, serverTime: new Date().toISOString() };
  }

  /**
   * Pull server changes since timestamp
   * - returns both updated rows AND tombstones (deleted rows)
   */
  async pull(userId: string, sinceIso?: string, limit = 500) {
    const since = sinceIso ? new Date(sinceIso) : new Date(0);
    if (Number.isNaN(since.getTime())) {
      throw new BadRequestException(
        "since must be a valid ISO 8601 date string"
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

    return {
      serverTime: new Date().toISOString(),
      transactions,
    };
  }

  /**
   * UPSERT (create or update)
   * - uses client timestamp (payload.clientUpdatedAt) else payload.updatedAt
   * - blocks resurrect of deleted rows unless incoming is newer
   */
  private async applyUpsertTransaction(
    userId: string,
    deviceId: string,
    payload: any
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

    // Ignore old/equal writes (idempotent)
    if (existing && incomingClientUpdatedAt <= existingTs) {
      return "ignored";
    }

    // If server already tombstoned it, prevent resurrection from older client ops
    // Allow "restore" only if incoming is newer than the tombstone timestamp
    const isDeletedOnServer = !!existing?.deletedAt;
    if (
      existing &&
      isDeletedOnServer &&
      incomingClientUpdatedAt <= existingTs
    ) {
      return "ignored";
    }

    // Cloudinary cleanup if receipt changed (idempotent safe)
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

      clientName: payload.clientName ?? null,
      projectTitle: payload.projectTitle ?? null,
      notes: payload.notes ?? null,
      tags: payload.tags ?? [],
      receiptImage: payload.receiptImage ?? null,
      receiptPublicId: payload.receiptPublicId ?? null,

      // LWW timestamp from client
      clientUpdatedAt: incomingClientUpdatedAt,

      // ✅ If incoming is newer, allow "restore" (optional but recommended)
      // ✅ PRESERVE TOMBSTONE
      deletedAt: existing?.deletedAt ?? null,
      deletedByDeviceId: existing?.deletedByDeviceId ?? null,
    };

    // Validate required date fields
    if (Number.isNaN(baseData.date.getTime())) {
      throw new BadRequestException(
        "payload.date must be a valid ISO 8601 date string"
      );
    }
    if (baseData.dueDate && Number.isNaN(baseData.dueDate.getTime())) {
      throw new BadRequestException(
        "payload.dueDate must be a valid ISO 8601 date string"
      );
    }

    // Build safe splits
    const safeSplits = await this.filterSplitsByExistingContacts(
      userId,
      payload.splits
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
          "payload.createdAt must be a valid ISO 8601 date string"
        );
      }

      await this.prisma.transaction.create({
        data: {
          id: payload.id, // ✅ critical for idempotency
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

  /**
   * DELETE (tombstone)
   * - conflict safe
   * - idempotent
   */
  private async applyDeleteTransaction(
    userId: string,
    deviceId: string,
    id: string,
    clientTs: Date
  ): Promise<"applied" | "ignored"> {
    const existing = await this.prisma.transaction.findUnique({
      where: { id },
    });
    if (!existing) return "ignored"; // idempotent: nothing to delete
    if (existing.userId !== userId) throw new ForbiddenException();

    const existingTs =
      existing.clientUpdatedAt ?? existing.updatedAt ?? new Date(0);

    // Older/equal delete should not win
    if (clientTs < existingTs) return "ignored";

    // Cloudinary cleanup once (optional)
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

  /**
   * Parse client timestamp from payload
   * Accepts payload.clientUpdatedAt first, else payload.updatedAt
   */
  private parseClientTs(payload: any): Date {
    const raw = payload?.clientUpdatedAt ?? payload?.updatedAt;
    const dt = raw ? new Date(raw) : new Date();
    if (Number.isNaN(dt.getTime())) {
      throw new BadRequestException(
        "clientUpdatedAt/updatedAt must be a valid ISO 8601 date string"
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
          .filter((x: any) => typeof x === "string" && x.length > 0)
      )
    );

    if (!ids.length) return [];

    const contacts = await this.prisma.contact.findMany({
      where: { userId, id: { in: ids } },
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
  private validatePayload(op: SyncOpDto) {
    if (op.op === SyncOpType.DELETE) {
      if (!op.payload?.id)
        throw new BadRequestException("DELETE payload.id required");
      // updatedAt or clientUpdatedAt recommended
      return;
    }

    if (op.op === SyncOpType.UPSERT) {
      const p = op.payload;
      const required = ["id", "title", "amount", "type", "category", "date"];
      for (const k of required) {
        if (p?.[k] === undefined || p?.[k] === null || p?.[k] === "") {
          throw new BadRequestException(`UPSERT payload.${k} required`);
        }
      }
      return;
    }
  }
}
