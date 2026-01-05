import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ContactsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.contact.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
  }

  async create(userId: string, name: string) {
    return this.prisma.contact.create({
      data: {
        userId,
        name,
      },
    });
  }

  async update(userId: string, id: string, name: string) {
    return this.prisma.contact.updateMany({
      where: { id, userId },
      data: { name },
    });
  }

  async delete(userId: string, id: string) {
    return this.prisma.contact.deleteMany({
      where: { id, userId },
    });
  }
}
