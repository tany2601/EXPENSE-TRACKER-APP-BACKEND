// src/categories/categories.service.ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  getAll(userId: string) {
    return this.prisma.category.findMany({
      where: {
        deletedAt: null,
        OR: [{ isDefault: true, userId: null }, { userId }],
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
  }

  create(userId: string, dto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: {
        ...dto,
        userId,
        isDefault: false,
        clientUpdatedAt: new Date(),
      },
    });
  }

  update(userId: string, id: string, dto: UpdateCategoryDto) {
    // prevents editing defaults
    return this.prisma.category.updateMany({
      where: { id, userId, isDefault: false, deletedAt: null },
      data: { ...dto, clientUpdatedAt: new Date() },
    });
  }

  delete(userId: string, id: string) {
    // prevent deleting defaults AND soft-delete custom categories
    return this.prisma.category.updateMany({
      where: { id, userId, isDefault: false, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedByDeviceId: "web",
        clientUpdatedAt: new Date(),
      },
    });
  }
}
