import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateTemplateDto } from "../dto/create-template.dto";
import { UpdateTemplateDto } from "../dto/update-template.dto";

@Injectable()
export class NotificationTemplateService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.notificationTemplate.findMany({
      orderBy: [{ triggerCategory: "asc" }, { sortOrder: "asc" }],
    });
  }

  findActive(triggerCategory: string) {
    return this.prisma.notificationTemplate.findMany({
      where: { triggerCategory, isActive: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  async findById(id: string) {
    const t = await this.prisma.notificationTemplate.findUnique({ where: { id } });
    if (!t) throw new NotFoundException("Template not found");
    return t;
  }

  create(dto: CreateTemplateDto) {
    return this.prisma.notificationTemplate.create({ data: dto });
  }

  async update(id: string, dto: UpdateTemplateDto) {
    await this.findById(id);
    return this.prisma.notificationTemplate.update({
      where: { id },
      data: { ...dto, updatedAt: new Date() },
    });
  }

  async remove(id: string) {
    await this.findById(id);
    return this.prisma.notificationTemplate.delete({ where: { id } });
  }

  // Replace {{key}} placeholders with context values
  render(template: string, ctx: Record<string, string | number>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
      ctx[key] !== undefined ? String(ctx[key]) : `{{${key}}}`
    );
  }
}
