import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
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

  // ── Daily 6 PM: engagement (Zomato-style) ─────────────────────────────────
  @Cron("0 18 * * *", { name: "engagement_batch" })
  async runEngagementBatch() {
    this.logger.log("Running ENGAGEMENT_BATCH");
    await this.runEngagement();
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

  // ── Generic batch: fetch templates, send to all eligible users ────────────
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

  // ── Engagement batch: one random message per user per week ────────────────
  private async runEngagement() {
    const templates = await this.templateService.findActive("ENGAGEMENT_BATCH");
    if (!templates.length) return;

    const users = await this.getActiveUsers();
    let sent = 0;

    for (const user of users) {
      // Check user preference
      const pref = await this.prisma.notificationPreference.findUnique({
        where: { userId: user.id },
      });
      if (pref && !pref.engagementEnabled) continue;

      // Weekly dedup — one engagement per user per week
      const weekBucket = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
      const dedupKey = `engagement_${user.id}_${weekBucket}`;

      const alreadySent = await this.prisma.notificationDelivery.findUnique({
        where: { dedupKey },
      });
      if (alreadySent) continue;

      // Pick a random template from the pool
      const template = templates[Math.floor(Math.random() * templates.length)];

      // Personalise if the template has {{placeholders}}
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

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getActiveUsers() {
    // Users who have at least one active device token (have the app installed)
    return this.prisma.user.findMany({
      where: { deviceTokens: { some: {} } },
      select: { id: true },
    });
  }

  // Manual trigger (called from admin controller)
  async triggerManual(triggerCategory: string) {
    if (triggerCategory === "ENGAGEMENT_BATCH") {
      await this.runEngagement();
    } else {
      await this.runBatch(triggerCategory);
    }
  }
}
