import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class DeviceTokenService {
  constructor(private prisma: PrismaService) {}

  // Called by the app on every startup after login
  async upsert(
    userId: string,
    deviceId: string,
    fcmToken: string,
    platform: "android" | "ios"
  ) {
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

  // Called after FCM reports a token as invalid
  async removeByToken(fcmToken: string) {
    await this.prisma.deviceToken.deleteMany({ where: { fcmToken } });
  }

  async removeForDevice(userId: string, deviceId: string) {
    await this.prisma.deviceToken.deleteMany({
      where: { userId, deviceId },
    });
  }
}
