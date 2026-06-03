import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationTemplateService } from "./notification-template.service";
import { NotificationDeliveryService } from "./notification-delivery.service";
import { PersonalizationEngine } from "./personalization.engine";

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private templateService: NotificationTemplateService,
    private delivery: NotificationDeliveryService,
    private personalization: PersonalizationEngine
  ) {}

  // ── Daily 9 AM: due payments + overdue + alerts ────────────────────────────
  @Cron("0 9 * * *", { name: "daily_alerts" })
  async runDailyAlerts() {
    this.logger.log("Running DAILY_ALERTS batch");
    await this.runBatch("DAILY_ALERTS");
  }

  // ── Daily 6 PM: engagement (Zomato-style, active users only) ──────────────
  @Cron("0 18 * * *", { name: "engagement_batch" })
  async runEngagementBatch() {
    this.logger.log("Running ENGAGEMENT_BATCH");
    await this.runEngagement();
  }

  // ── Daily 11 AM: re-engagement for users inactive 3-30 days ──────────────
  @Cron("0 11 * * *", { name: "reengagement_batch" })
  async runReengagementBatch() {
    this.logger.log("Running REENGAGEMENT_BATCH");
    await this.runReengagement();
  }

  // ── Monday 8 AM: weekly spending insights ─────────────────────────────────
  @Cron("0 8 * * 1", { name: "weekly_insights" })
  async runWeeklyInsights() {
    this.logger.log("Running WEEKLY_INSIGHTS batch");
    await this.runBatch("WEEKLY_INSIGHTS");
  }

  // ── 1st of month 9 AM: savings milestones ─────────────────────────────────
  @Cron("0 9 1 * *", { name: "monthly_milestones" })
  async runMonthlyMilestones() {
    this.logger.log("Running MONTHLY_MILESTONES batch");
    await this.runBatch("MONTHLY_MILESTONES");
  }

  // ── Generic batch ─────────────────────────────────────────────────────────
  private async runBatch(triggerCategory: string) {
    const [templates, users] = await Promise.all([
      this.templateService.findActive(triggerCategory),
      this.getActiveUsers(),
    ]);

    if (!templates.length || !users.length) return;

    let totalSent = 0;
    for (const template of templates) {
      const sent = await this.delivery.sendTemplateToUsers(
        template,
        users.map((u) => u.id)
      );
      totalSent += sent;
    }

    this.logger.log(`${triggerCategory}: sent ${totalSent} notifications`);
  }

  // ── Engagement: one random Zomato-style message per active user per week ──
  private async runEngagement() {
    const templates = await this.templateService.findActive("ENGAGEMENT_BATCH");
    if (!templates.length) return;

    // Only target users who opened the app in the last 3 days
    const activeUsers = await this.getRecentlyActiveUsers(3);
    let sent = 0;

    for (const user of activeUsers) {
      const pref = await this.prisma.notificationPreference.findUnique({
        where: { userId: user.id },
      });
      if (pref && !pref.engagementEnabled) continue;

      const weekBucket = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
      const dedupKey = `engagement_${user.id}_${weekBucket}`;

      const alreadySent = await this.prisma.notificationDelivery.findUnique({
        where: { dedupKey },
      });
      if (alreadySent) continue;

      const template = templates[Math.floor(Math.random() * templates.length)];

      const ctx = await this.personalization.computeForUser(user.id);
      const tplCtx = this.personalization.buildTemplateContext(ctx);
      const title = this.templateService.render(template.title, tplCtx);
      const body = this.templateService.render(template.body, tplCtx);

      const ok = await this.delivery.send({
        userId: user.id,
        templateId: template.id,
        title,
        body,
        dedupKey,
        deepLinkScreen: template.deepLinkScreen,
        deepLinkData: template.deepLinkData,
      });

      if (ok) sent++;
    }

    this.logger.log(`ENGAGEMENT_BATCH: sent ${sent} notifications`);
  }

  // ── Re-engagement: nudge users who haven't opened in 3-30 days ────────────
  private async runReengagement() {
    const templates = await this.templateService.findActive("REENGAGEMENT_BATCH");
    if (!templates.length) return;

    const inactiveUsers = await this.getInactiveUsers(3, 30);
    let sent = 0;

    for (const user of inactiveUsers) {
      const pref = await this.prisma.notificationPreference.findUnique({
        where: { userId: user.id },
      });
      if (pref && !pref.engagementEnabled) continue;

      // One re-engagement per user per 3 days
      const dayBucket = Math.floor(Date.now() / (3 * 24 * 60 * 60 * 1000));
      const dedupKey = `reengagement_${user.id}_${dayBucket}`;

      const alreadySent = await this.prisma.notificationDelivery.findUnique({
        where: { dedupKey },
      });
      if (alreadySent) continue;

      const template = templates[Math.floor(Math.random() * templates.length)];

      const ctx = await this.personalization.computeForUser(user.id);
      const tplCtx = this.personalization.buildTemplateContext(ctx);
      const title = this.templateService.render(template.title, tplCtx);
      const body = this.templateService.render(template.body, tplCtx);

      const ok = await this.delivery.send({
        userId: user.id,
        templateId: template.id,
        title,
        body,
        dedupKey,
        deepLinkScreen: template.deepLinkScreen,
        deepLinkData: template.deepLinkData,
      });

      if (ok) sent++;
    }

    this.logger.log(`REENGAGEMENT_BATCH: sent ${sent} notifications`);
  }

  // ── Weekly Sunday 3 AM: delete tokens inactive for 90 days ───────────────
  @Cron("0 3 * * 0", { name: "cleanup_stale_tokens" })
  async cleanupStaleTokens() {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const result = await this.prisma.deviceToken.deleteMany({
      where: { updatedAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} stale device tokens`);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  // Users with at least one token (app is installed)
  private getActiveUsers() {
    return this.prisma.user.findMany({
      where: { deviceTokens: { some: {} } },
      select: { id: true },
    });
  }

  // Users whose most recent token was updated within the last N days
  private async getRecentlyActiveUsers(withinDays: number) {
    const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);
    const tokens = await this.prisma.deviceToken.findMany({
      where: { updatedAt: { gte: since } },
      select: { userId: true },
      distinct: ["userId"],
    });
    return tokens.map((t) => ({ id: t.userId }));
  }

  // Users who have a token but haven't opened the app in minDays-maxDays
  private async getInactiveUsers(minDays: number, maxDays: number) {
    const minCutoff = new Date(Date.now() - minDays * 24 * 60 * 60 * 1000);
    const maxCutoff = new Date(Date.now() - maxDays * 24 * 60 * 60 * 1000);

    // Get userIds who have at least one token updated in the inactive window
    const tokens = await this.prisma.deviceToken.findMany({
      where: { updatedAt: { lte: minCutoff, gte: maxCutoff } },
      select: { userId: true },
      distinct: ["userId"],
    });

    // Exclude users who also have a recently active token on another device
    const recentlyActiveIds = new Set(
      (await this.getRecentlyActiveUsers(minDays)).map((u) => u.id)
    );

    return tokens
      .filter((t) => !recentlyActiveIds.has(t.userId))
      .map((t) => ({ id: t.userId }));
  }

  // Manual trigger (called from admin controller)
  async triggerManual(triggerCategory: string) {
    if (triggerCategory === "ENGAGEMENT_BATCH") {
      await this.runEngagement();
    } else if (triggerCategory === "REENGAGEMENT_BATCH") {
      await this.runReengagement();
    } else {
      await this.runBatch(triggerCategory);
    }
  }
}
