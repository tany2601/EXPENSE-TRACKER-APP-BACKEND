// src/contacts/contacts.service.ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ContactsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.contact.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
  }

  async create(userId: string, name: string) {
    return this.prisma.contact.create({
      data: {
        userId,
        name,
        clientUpdatedAt: new Date(),
      },
    });
  }

  async update(userId: string, id: string, name: string) {
    return this.prisma.contact.updateMany({
      where: { id, userId, deletedAt: null },
      data: { name, clientUpdatedAt: new Date() },
    });
  }

  async delete(userId: string, id: string) {
    await this.prisma.contact.updateMany({
      where: { id, userId, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedByDeviceId: "web",
        clientUpdatedAt: new Date(),
      },
    });

    return { success: true };
  }
}
