import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class DeviceTokenService {
  constructor(private prisma: PrismaService) {}

  // Called by the app on every startup after login.
  // Handles three cases automatically:
  //   1. Normal open: same userId + deviceId → updates fcmToken if rotated
  //   2. New device: different deviceId → creates new row
  //   3. App data cleared: new deviceId, FCM may have issued a new token →
  //      any old row sharing the same fcmToken (now reassigned) is deleted first
  async upsert(
    userId: string,
    deviceId: string,
    fcmToken: string,
    platform: "android" | "ios"
  ) {
    if (!deviceId) return; // safety guard — never store with empty deviceId

    // If this exact FCM token exists under a different deviceId for this user
    // (happens after app data clear — Android reuses or reassigns the token),
    // remove the stale row so the upsert below starts clean.
    await this.prisma.deviceToken.deleteMany({
      where: {
        userId,
        fcmToken,
        NOT: { deviceId },
      },
    });

    return this.prisma.deviceToken.upsert({
      where: { userId_deviceId: { userId, deviceId } },
      create: { userId, deviceId, fcmToken, platform },
      update: { fcmToken, platform },
    });
  }

  async getTokensForUser(userId: string): Promise<string[]> {
    const rows = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: { fcmToken: true },
    });
    return rows.map((r) => r.fcmToken);
  }

  // Called after FCM reports a token as invalid — removes across all users
  async removeByToken(fcmToken: string) {
    await this.prisma.deviceToken.deleteMany({ where: { fcmToken } });
  }

  async removeForDevice(userId: string, deviceId: string) {
    await this.prisma.deviceToken.deleteMany({
      where: { userId, deviceId },
    });
  }
}
