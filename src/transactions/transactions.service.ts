
import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateTransactionDto } from './dto/create-transaction.dto';

@Injectable()
export class TransactionsService {
  private transactions: any[] = [];

  create(dto: CreateTransactionDto, userId: string) {
    const newTransaction = {
      ...dto,
      id: Math.random().toString(36).substr(2, 9),
      userId,
      createdAt: new Date().toISOString(),
    };
    this.transactions.push(newTransaction);
    return newTransaction;
  }

  findAll(userId: string) {
    return this.transactions
      .filter(t => t.userId === userId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  remove(id: string, userId: string) {
    const index = this.transactions.findIndex(t => t.id === id && t.userId === userId);
    if (index === -1) {
      throw new NotFoundException('Transaction not found');
    }
    this.transactions.splice(index, 1);
    return { success: true };
  }
}
