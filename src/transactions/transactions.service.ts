import { Injectable, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTransactionDto } from "./dto/create-transaction.dto";
import { UpdateTransactionDto } from "./dto/update-transaction.dto";
import cloudinary from "../cloudinary/cloudinary.config";
import { deleteImage } from "src/cloudinary/delete-image";

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  // -------------------------
  // Create transaction
  // -------------------------
  async create(dto: CreateTransactionDto, userId: string) {
    return this.prisma.transaction.create({
      data: {
        userId,
        title: dto.title,
        amount: dto.amount,
        type: dto.type,
        category: dto.category,
        date: new Date(dto.date),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        isPaid: dto.isPaid ?? true,
        clientName: dto.clientName,
        projectTitle: dto.projectTitle,
        notes: dto.notes,
        tags: dto.tags ?? [],
        receiptImage: dto.receiptImage ?? null,
        receiptPublicId: dto.receiptPublicId ?? null,

        splits: dto.splits
          ? {
              create: dto.splits.map((s) => ({
                participantId: s.participantId,
                amount: s.amount,
              })),
            }
          : undefined,
        updatedAt: new Date(),
        clientUpdatedAt: new Date(),
      },
      include: {
        splits: { include: { participant: true } },
      },
    });
  }

  // -------------------------
  // Get all
  // -------------------------
  async findAll(userId: string) {
    return this.prisma.transaction.findMany({
      where: { userId, deletedAt: null },
      orderBy: { date: "desc" },
      include: {
        splits: { include: { participant: true } },
      },
    });
  }

  // -------------------------
  // Update transaction
  // -------------------------
  async update(id: string, userId: string, dto: UpdateTransactionDto) {
    const tx = await this.prisma.transaction.findUnique({ where: { id } });

    if (!tx || tx.userId !== userId) {
      throw new ForbiddenException();
    }

    // 🔥 DELETE OLD RECEIPT IF REMOVED OR REPLACED
    if (
      tx.receiptPublicId &&
      (dto.receiptPublicId === null ||
        dto.receiptPublicId !== tx.receiptPublicId)
    ) {
      await deleteImage(tx.receiptPublicId);
    }

    return this.prisma.transaction.update({
      where: { id },
      data: {
        title: dto.title,
        amount: dto.amount,
        type: dto.type,
        category: dto.category,

        date: dto.date ? new Date(dto.date) : undefined,

        // ✅ allow clearing dueDate by passing null
        dueDate:
          dto.dueDate === undefined
            ? undefined
            : dto.dueDate
              ? new Date(dto.dueDate)
              : null,

        isPaid: dto.isPaid,
        clientName: dto.clientName,
        projectTitle: dto.projectTitle,
        notes: dto.notes,
        tags: dto.tags,

        // ✅ NEW: allow dismiss timestamp update (and allow clearing with null)
        reminderDismissedAt:
          dto.reminderDismissedAt === undefined
            ? undefined
            : dto.reminderDismissedAt
              ? new Date(dto.reminderDismissedAt)
              : null,

        // ✅ If dueDate was changed in this PATCH, re-enable reminders
        ...(dto.dueDate !== undefined ? { reminderDismissedAt: null } : {}),

        // ✅ THESE MUST ACCEPT NULL
        receiptImage: dto.receiptImage,
        receiptPublicId: dto.receiptPublicId,

        splits: dto.splits
          ? {
              deleteMany: {},
              create: dto.splits.map((s) => ({
                participantId: s.participantId,
                amount: s.amount,
              })),
            }
          : undefined,
        // 🔥 ADD THIS AT THE END
        updatedAt: new Date(),
        clientUpdatedAt: new Date(),
      },

      include: {
        splits: { include: { participant: true } },
      },
    });
  }

  // -------------------------
  // Delete transaction
  // -------------------------
  // transactions.service.ts
  async delete(id: string, userId: string) {
    const tx = await this.prisma.transaction.findUnique({ where: { id } });
    if (!tx || tx.userId !== userId) throw new ForbiddenException();

    if (tx.receiptPublicId) {
      await cloudinary.uploader.destroy(tx.receiptPublicId);
    }

    // ✅ SOFT DELETE so sync & pull works
    await this.prisma.transaction.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedByDeviceId: "web",
        updatedAt: new Date(), 
        clientUpdatedAt: new Date(), // or new Date().toISOString() if your schema expects string (usually DateTime)
      },
    });

    return { success: true };
  }

  // -------------------------
  // Pay split
  // -------------------------
  async paySplit(transactionId: string, participantId: string, userId: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { splits: true },
    });

    if (!tx || tx.userId !== userId) {
      throw new ForbiddenException();
    }

    // ✅ 1. Update the split
    await this.prisma.transactionSplit.updateMany({
      where: { transactionId, participantId },
      data: { isPaid: true },
    });

    // ✅ 2. Check remaining unpaid splits
    const remaining = await this.prisma.transactionSplit.count({
      where: { transactionId, isPaid: false },
    });

    // ✅ 3. ALWAYS update parent transaction (CRITICAL FOR SYNC)
    await this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        isPaid: remaining === 0 ? true : tx.isPaid,

        // 🔥 THESE TWO FIX YOUR SYNC ISSUE
        updatedAt: new Date(),
        clientUpdatedAt: new Date(),
      },
    });

    // ✅ 4. Return updated transaction
    return this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        splits: { include: { participant: true } },
      },
    });
  }

  // -------------------------
  // Delete receipt only
  // -------------------------
  async deleteReceipt(transactionId: string, userId: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!tx || tx.userId !== userId) {
      throw new ForbiddenException();
    }

    if (tx.receiptPublicId) {
      await cloudinary.uploader.destroy(tx.receiptPublicId);
    }

    return this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        receiptImage: null,
        receiptPublicId: null,
        updatedAt: new Date(),
        clientUpdatedAt: new Date(),
      },
    });
  }
}
