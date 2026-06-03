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
import { IsString, IsNotEmpty } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "./guards/admin.guard";
import { NotificationTemplateService } from "./services/notification-template.service";
import { NotificationSchedulerService } from "./services/notification-scheduler.service";
import { NotificationDeliveryService } from "./services/notification-delivery.service";
import { DeviceTokenService } from "./services/device-token.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTemplateDto } from "./dto/create-template.dto";
import { UpdateTemplateDto } from "./dto/update-template.dto";

class BroadcastDto {
  @IsString() @IsNotEmpty() type: string;
  @IsString() @IsNotEmpty() title: string;
  @IsString() @IsNotEmpty() body: string;
}

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/notifications")
export class AdminNotificationsController {
  constructor(
    private templateService: NotificationTemplateService,
    private scheduler: NotificationSchedulerService,
    private delivery: NotificationDeliveryService,
    private deviceTokens: DeviceTokenService,
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

  // ── Broadcast: send to ALL users, bypasses dedup/segments ─────────────────

  @Post("broadcast")
  async broadcast(@Body() dto: BroadcastDto) {
    const users = await this.prisma.user.findMany({
      where: { deviceTokens: { some: {} } },
      select: { id: true },
    });

    let sent = 0;

    for (const user of users) {
      const dedupKey = `broadcast_${dto.type}_${user.id}_${Date.now()}`;
      const ok = await this.delivery.send({
        userId: user.id,
        templateId: null,
        title: dto.title,
        body: dto.body,
        dedupKey,
        deepLinkScreen: null,
        deepLinkData: null,
      });
      if (ok) sent++;
    }

    return { ok: true, sent, total: users.length };
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

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
      include: {
        template: { select: { name: true } },
        user: { select: { name: true, email: true } },
      },
    });
  }
}
