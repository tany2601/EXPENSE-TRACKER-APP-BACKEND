import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "./guards/admin.guard";
import { NotificationTemplateService } from "./services/notification-template.service";
import { NotificationSchedulerService } from "./services/notification-scheduler.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTemplateDto } from "./dto/create-template.dto";
import { UpdateTemplateDto } from "./dto/update-template.dto";

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/notifications")
export class AdminNotificationsController {
  constructor(
    private templateService: NotificationTemplateService,
    private scheduler: NotificationSchedulerService,
    private prisma: PrismaService
  ) {}

  // ── Templates ──────────────────────────────────────────────────────────────

  @Get("templates")
  listTemplates() {
    return this.templateService.findAll();
  }

  @Post("templates")
  createTemplate(@Body() dto: CreateTemplateDto) {
    return this.templateService.create(dto);
  }

  @Patch("templates/:id")
  updateTemplate(@Param("id") id: string, @Body() dto: UpdateTemplateDto) {
    return this.templateService.update(id, dto);
  }

  @Delete("templates/:id")
  deleteTemplate(@Param("id") id: string) {
    return this.templateService.remove(id);
  }

  // ── Manual trigger ─────────────────────────────────────────────────────────

  @Post("trigger/:category")
  async triggerBatch(@Param("category") category: string) {
    await this.scheduler.triggerManual(category);
    return { ok: true };
  }

  // ── Delivery stats ─────────────────────────────────────────────────────────

  @Get("stats")
  async getStats() {
    const [total, sent, opened, failed, deviceTokens] = await Promise.all([
      this.prisma.notificationDelivery.count(),
      this.prisma.notificationDelivery.count({ where: { status: "SENT" } }),
      this.prisma.notificationDelivery.count({ where: { status: "OPENED" } }),
      this.prisma.notificationDelivery.count({ where: { status: "FAILED" } }),
      this.prisma.deviceToken.count(),
    ]);

    return { total, sent, opened, failed, deviceTokens };
  }

  @Get("recent")
  getRecentDeliveries(@Query("limit") limit?: string) {
    return this.prisma.notificationDelivery.findMany({
      orderBy: { sentAt: "desc" },
      take: limit ? parseInt(limit, 10) : 50,
      include: { template: { select: { name: true } }, user: { select: { name: true, email: true } } },
    });
  }
}
