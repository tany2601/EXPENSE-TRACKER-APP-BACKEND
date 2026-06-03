import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Req,
  UseGuards,
  Param,
  Query,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DeviceTokenService } from "./services/device-token.service";
import { NotificationDeliveryService } from "./services/notification-delivery.service";
import { RegisterTokenDto } from "./dto/register-token.dto";
import { UpdatePreferenceDto } from "./dto/update-preference.dto";
import { PrismaService } from "../prisma/prisma.service";

@UseGuards(JwtAuthGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(
    private deviceTokens: DeviceTokenService,
    private delivery: NotificationDeliveryService,
    private prisma: PrismaService
  ) {}

  // Register or refresh FCM token
  @Post("token")
  registerToken(@Req() req: any, @Body() dto: RegisterTokenDto) {
    return this.deviceTokens.upsert(
      req.user.id,
      dto.deviceId,
      dto.fcmToken,
      dto.platform
    );
  }

  // Remove token on logout
  @Delete("token/:deviceId")
  removeToken(@Req() req: any, @Param("deviceId") deviceId: string) {
    return this.deviceTokens.removeForDevice(req.user.id, deviceId);
  }

  // Get notification preferences
  @Get("preferences")
  async getPreferences(@Req() req: any) {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId: req.user.id },
    });

    return (
      pref ?? {
        pushEnabled: true,
        emailEnabled: false,
        insightsEnabled: true,
        alertsEnabled: true,
        engagementEnabled: true,
        quietHoursStart: null,
        quietHoursEnd: null,
      }
    );
  }

  // Upsert notification preferences
  @Patch("preferences")
  async updatePreferences(@Req() req: any, @Body() dto: UpdatePreferenceDto) {
    return this.prisma.notificationPreference.upsert({
      where: { userId: req.user.id },
      create: { userId: req.user.id, ...dto },
      update: dto,
    });
  }

  // In-app notification history
  @Get("history")
  getHistory(@Req() req: any, @Query("limit") limit?: string) {
    return this.delivery.getHistoryForUser(
      req.user.id,
      limit ? parseInt(limit, 10) : 20
    );
  }

  // Mark notification opened
  @Post("opened/:dedupKey")
  markOpened(@Param("dedupKey") dedupKey: string) {
    return this.delivery.markOpened(dedupKey);
  }
}
