import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { FcmService } from "./fcm.service";
import { DeviceTokenService } from "./device-token.service";
import { NotificationTemplateService } from "./notification-template.service";
import { PersonalizationEngine } from "./personalization.engine";
import type { NotificationTemplate } from "@prisma/client";

interface SendOptions {
  userId: string;
  templateId: string;
  title: string;
  body: string;
  dedupKey: string;
  deepLinkScreen?: string | null;
  deepLinkData?: string | null;
}

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private prisma: PrismaService,
    private fcm: FcmService,
    private deviceTokens: DeviceTokenService,
    private templateService: NotificationTemplateService,
    private personalization: PersonalizationEngine
  ) {}

  // ── Core send (dedup + FCM + save record) ──────────────────────────────────

  async send(opts: SendOptions): Promise<boolean> {
    const { userId, templateId, title, body, dedupKey } = opts;

    // 1. Dedup check
    const existing = await this.prisma.notificationDelivery.findUnique({
      where: { dedupKey },
    });
    if (existing) return false;

    // 2. Check user push preference
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (pref && !pref.pushEnabled) return false;

    // 3. Check quiet hours (use local server time as approximation)
    if (pref?.quietHoursStart != null && pref?.quietHoursEnd != null) {
      const hour = new Date().getHours();
      const { quietHoursStart: start, quietHoursEnd: end } = pref;
      const inQuiet =
        start < end
          ? hour >= start && hour < end
          : hour >= start || hour < end;
      if (inQuiet) return false;
    }

    // 4. Get FCM tokens for user
    const tokens = await this.deviceTokens.getTokensForUser(userId);
    if (tokens.length === 0) {
      await this.saveDelivery({ ...opts, status: "FAILED" });
      return false;
    }

    // 5. Build deep link data payload
    // dedupKey is included so the app can call markOpened when the user taps
    const data: Record<string, string> = { dedupKey };
    if (opts.deepLinkScreen) data.screen = opts.deepLinkScreen;
    if (opts.deepLinkData) data.extra = opts.deepLinkData;

    // 6. Send via FCM
    const invalidTokens = await this.fcm.sendToTokens(tokens, title, body, data);

    // Clean up dead tokens
    for (const t of invalidTokens) {
      await this.deviceTokens.removeByToken(t);
    }

    const allFailed = invalidTokens.length === tokens.length;
    const status = allFailed ? "FAILED" : "SENT";

    // 7. Save delivery record (drives dedup for future sends)
    await this.saveDelivery({ ...opts, status });

    return status === "SENT";
  }

  private async saveDelivery(
    opts: SendOptions & { status: string }
  ) {
    try {
      await this.prisma.notificationDelivery.create({
        data: {
          userId: opts.userId,
          templateId: opts.templateId,
          dedupKey: opts.dedupKey,
          title: opts.title,
          body: opts.body,
          status: opts.status,
        },
      });
    } catch {
      // dedupKey unique violation is expected if races occur — ignore
    }
  }

  // ── Mark opened (called when user taps notification) ──────────────────────

  async markOpened(dedupKey: string) {
    await this.prisma.notificationDelivery.updateMany({
      where: { dedupKey },
      data: { status: "OPENED", openedAt: new Date() },
    });
  }

  // ── Batch: send a template to a list of users ─────────────────────────────

  async sendTemplateToUsers(
    template: NotificationTemplate,
    userIds: string[]
  ) {
    let sent = 0;

    for (const userId of userIds) {
      // Compute personalization if needed
      const ctx = await this.personalization.computeForUser(userId);
      const tplCtx = this.personalization.buildTemplateContext(ctx);

      // Check condition
      if (!this.personalization.meetsCondition(template.condition, ctx)) {
        continue;
      }

      // Render title/body
      const title = this.templateService.render(template.title, tplCtx);
      const body = this.templateService.render(template.body, tplCtx);

      // Compute dedup key (scoped to template + user + time bucket)
      const bucket = this.timeBucket(template.dedupWindowDays);
      const dedupKey = `${template.id}_${userId}_${bucket}`;

      const ok = await this.send({
        userId,
        templateId: template.id,
        title,
        body,
        dedupKey,
        deepLinkScreen: template.deepLinkScreen,
        deepLinkData: template.deepLinkData,
      });

      if (ok) sent++;
    }

    return sent;
  }

  // Bucket string so dedup resets after dedupWindowDays
  private timeBucket(days: number): string {
    const epochDays = Math.floor(Date.now() / (days * 24 * 60 * 60 * 1000));
    return String(epochDays);
  }

  // ── User notification history ─────────────────────────────────────────────

  async getHistoryForUser(userId: string, limit = 20) {
    return this.prisma.notificationDelivery.findMany({
      where: { userId },
      orderBy: { sentAt: "desc" },
      take: limit,
      select: {
        id: true,
        title: true,
        body: true,
        status: true,
        sentAt: true,
        openedAt: true,
      },
    });
  }
}
