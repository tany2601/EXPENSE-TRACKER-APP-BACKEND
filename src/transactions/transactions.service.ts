import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  create(dto: CreateTransactionDto, userId: string) {
    return this.prisma.transaction.create({
      data: { ...dto, userId, date: new Date(dto.date) },
    });
  }

  findAll(userId: string) {
    return this.prisma.transaction.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
    });
  }

  async delete(id: string, userId: string) {
    const tx = await this.prisma.transaction.findUnique({ where: { id } });
    if (!tx || tx.userId !== userId) throw new ForbiddenException();
    await this.prisma.transaction.delete({ where: { id } });
    return { success: true };
  }
}
