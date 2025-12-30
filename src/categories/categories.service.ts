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
      },
    });
  }

  update(userId: string, id: string, dto: UpdateCategoryDto) {
    return this.prisma.category.updateMany({
      where: { id, userId }, // prevents editing defaults
      data: dto,
    });
  }

  delete(userId: string, id: string) {
    return this.prisma.category.deleteMany({
      where: { id, userId }, // prevents deleting defaults
    });
  }
}
