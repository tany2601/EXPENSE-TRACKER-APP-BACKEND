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
  // Optional store URLs for APP_UPDATE type — sent as deep link data per platform
  @IsString() androidUrl?: string; // Play Store URL
  @IsString() iosUrl?: string;     // App Store URL
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
  // For APP_UPDATE type: sends platform-specific store URL so Android gets
  // Play Store link and iOS gets App Store link automatically.

  @Post("broadcast")
  async broadcast(@Body() dto: BroadcastDto) {
    // Get all device tokens grouped by user, preserving platform info
    const tokens = await this.prisma.deviceToken.findMany({
      select: { userId: true, platform: true },
      distinct: ["userId", "platform"],
    });

    // Build a map: userId → platforms[]
    const userPlatforms = new Map<string, string[]>();
    for (const t of tokens) {
      const existing = userPlatforms.get(t.userId) ?? [];
      if (!existing.includes(t.platform)) existing.push(t.platform);
      userPlatforms.set(t.userId, existing);
    }

    let sent = 0;
    const timestamp = Date.now();

    for (const [userId, platforms] of userPlatforms) {
      for (const platform of platforms) {
        // Pick the correct store URL based on platform
        let storeUrl: string | null = null;
        if (dto.type === "APP_UPDATE") {
          storeUrl = platform === "ios" ? (dto.iosUrl ?? null) : (dto.androidUrl ?? null);
        }

        const dedupKey = `broadcast_${dto.type}_${userId}_${platform}_${timestamp}`;
        const ok = await this.delivery.send({
          userId,
          templateId: null,
          title: dto.title,
          body: dto.body,
          dedupKey,
          deepLinkScreen: storeUrl ? "external" : null,
          deepLinkData: storeUrl ? JSON.stringify({ url: storeUrl }) : null,
        });
        if (ok) sent++;
      }
    }

    return { ok: true, sent, total: userPlatforms.size };
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
  async getRecentDeliveries(
    @Query("limit") limit?: string,
    @Query("page") page?: string,
    @Query("status") status?: string,
    @Query("templateId") templateId?: string,
    @Query("search") search?: string,
  ) {
    const take = Math.min(parseInt(limit ?? "20", 10), 100);
    const skip = (parseInt(page ?? "1", 10) - 1) * take;

    const where: any = {};
    if (status && status !== "ALL") where.status = status;
    if (templateId) where.templateId = templateId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.notificationDelivery.findMany({
        where,
        orderBy: { sentAt: "desc" },
        take,
        skip,
        include: {
          template: { select: { name: true, id: true } },
          user: { select: { name: true, email: true } },
        },
      }),
      this.prisma.notificationDelivery.count({ where }),
    ]);

    return { data, total, page: parseInt(page ?? "1", 10), limit: take, totalPages: Math.ceil(total / take) };
  }

  // ── Cron schedules ─────────────────────────────────────────────────────────

  @Get("schedules")
  getSchedules() {
    return this.scheduler.getAllSchedules();
  }

  @Patch("schedules/:name")
  updateSchedule(
    @Param("name") name: string,
    @Body() body: { expression: string; isActive: boolean }
  ) {
    return this.scheduler.updateSchedule(name, body.expression, body.isActive);
  }
}
