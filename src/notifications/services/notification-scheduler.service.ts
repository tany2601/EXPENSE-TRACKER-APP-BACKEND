import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron, SchedulerRegistry, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationTemplateService } from "./notification-template.service";
import { NotificationDeliveryService } from "./notification-delivery.service";
import { PersonalizationEngine } from "./personalization.engine";

// Default schedules — used if DB has no record yet
const DEFAULTS: Record<string, { expression: string; label: string }> = {
  daily_alerts:        { expression: "0 9 * * *",   label: "Daily Alerts (due payments, overdue, splits)" },
  engagement_batch:    { expression: "0 18 * * *",  label: "Engagement Batch (Zomato-style messages)" },
  reengagement_batch:  { expression: "0 11 * * *",  label: "Re-engagement Batch (inactive users)" },
  weekly_insights:     { expression: "0 8 * * 1",   label: "Weekly Insights (spending patterns)" },
  monthly_milestones:  { expression: "0 9 1 * *",   label: "Monthly Milestones (savings goals)" },
  cleanup_stale_tokens:{ expression: "0 3 * * 0",   label: "Token Cleanup (remove stale devices)" },
};

@Injectable()
export class NotificationSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private templateService: NotificationTemplateService,
    private delivery: NotificationDeliveryService,
    private personalization: PersonalizationEngine,
    private schedulerRegistry: SchedulerRegistry
  ) {}

  // On startup: seed DB with defaults if missing, then apply any saved expressions
  async onModuleInit() {
    for (const [name, def] of Object.entries(DEFAULTS)) {
      await this.prisma.cronSchedule.upsert({
        where: { name },
        create: { name, expression: def.expression, label: def.label },
        update: {},
      });
    }
    await this.applySchedulesFromDb();
  }

  // Load all saved cron expressions from DB and update the running jobs
  private async applySchedulesFromDb() {
    const schedules = await this.prisma.cronSchedule.findMany();
    for (const s of schedules) {
      try {
        const job = this.schedulerRegistry.getCronJob(s.name);
        // CronJob.setTime accepts a CronTime-like object — pass the expression string directly
        (job as any).setTime(new (require("cron").CronTime)(s.expression));
        if (s.isActive) job.start(); else job.stop();
        this.logger.log(`Applied schedule [${s.name}]: ${s.expression}`);
      } catch {
        // Job not registered yet on cold start — normal
      }
    }
  }

  // ── Cron jobs ──────────────────────────────────────────────────────────────
  // Expressions here are the startup defaults — DB overrides apply on module init

  @Cron("0 9 * * *", { name: "daily_alerts" })
  async runDailyAlerts() {
    this.logger.log("Running DAILY_ALERTS batch");
    await this.runBatch("DAILY_ALERTS");
  }

  @Cron("0 18 * * *", { name: "engagement_batch" })
  async runEngagementBatch() {
    this.logger.log("Running ENGAGEMENT_BATCH");
    await this.runEngagement();
  }

  @Cron("0 11 * * *", { name: "reengagement_batch" })
  async runReengagementBatch() {
    this.logger.log("Running REENGAGEMENT_BATCH");
    await this.runReengagement();
  }

  @Cron("0 8 * * 1", { name: "weekly_insights" })
  async runWeeklyInsights() {
    this.logger.log("Running WEEKLY_INSIGHTS batch");
    await this.runBatch("WEEKLY_INSIGHTS");
  }

  @Cron("0 9 1 * *", { name: "monthly_milestones" })
  async runMonthlyMilestones() {
    this.logger.log("Running MONTHLY_MILESTONES batch");
    await this.runBatch("MONTHLY_MILESTONES");
  }

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

  // ── Public API for admin controller ───────────────────────────────────────

  async getAllSchedules() {
    return this.prisma.cronSchedule.findMany({ orderBy: { name: "asc" } });
  }

  async updateSchedule(name: string, expression: string, isActive: boolean) {
    // Validate cron expression
    try {
      new (require("cron").CronTime)(expression);
    } catch {
      throw new Error(`Invalid cron expression: ${expression}`);
    }

    const schedule = await this.prisma.cronSchedule.update({
      where: { name },
      data: { expression, isActive },
    });

    // Apply immediately to the running job
    try {
      const job = this.schedulerRegistry.getCronJob(name);
      (job as any).setTime(new (require("cron").CronTime)(expression));
      if (isActive) job.start(); else job.stop();
      this.logger.log(`Updated schedule [${name}]: ${expression} active=${isActive}`);
    } catch (e) {
      this.logger.warn(`Could not apply schedule to job [${name}]: ${e}`);
    }

    return schedule;
  }

  async triggerManual(triggerCategory: string) {
    if (triggerCategory === "ENGAGEMENT_BATCH") {
      await this.runEngagement();
    } else if (triggerCategory === "REENGAGEMENT_BATCH") {
      await this.runReengagement();
    } else {
      await this.runBatch(triggerCategory);
    }
  }

  // ── Batch runners ─────────────────────────────────────────────────────────

  private async runBatch(triggerCategory: string) {
    const [templates, users] = await Promise.all([
      this.templateService.findActive(triggerCategory),
      this.getActiveUsers(),
    ]);
    if (!templates.length || !users.length) return;

    let totalSent = 0;
    for (const template of templates) {
      const sent = await this.delivery.sendTemplateToUsers(template, users.map((u) => u.id));
      totalSent += sent;
    }
    this.logger.log(`${triggerCategory}: sent ${totalSent} notifications`);
  }

  private async runEngagement() {
    const templates = await this.templateService.findActive("ENGAGEMENT_BATCH");
    if (!templates.length) return;

    const activeUsers = await this.getRecentlyActiveUsers(3);
    let sent = 0;

    for (const user of activeUsers) {
      const pref = await this.prisma.notificationPreference.findUnique({ where: { userId: user.id } });
      if (pref && !pref.engagementEnabled) continue;

      const weekBucket = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
      const dedupKey = `engagement_${user.id}_${weekBucket}`;
      const alreadySent = await this.prisma.notificationDelivery.findUnique({ where: { dedupKey } });
      if (alreadySent) continue;

      const template = templates[Math.floor(Math.random() * templates.length)];
      const ctx = await this.personalization.computeForUser(user.id);
      const tplCtx = this.personalization.buildTemplateContext(ctx);

      const ok = await this.delivery.send({
        userId: user.id, templateId: template.id,
        title: this.templateService.render(template.title, tplCtx),
        body: this.templateService.render(template.body, tplCtx),
        dedupKey, deepLinkScreen: template.deepLinkScreen, deepLinkData: template.deepLinkData,
      });
      if (ok) sent++;
    }
    this.logger.log(`ENGAGEMENT_BATCH: sent ${sent} notifications`);
  }

  private async runReengagement() {
    const templates = await this.templateService.findActive("REENGAGEMENT_BATCH");
    if (!templates.length) return;

    const inactiveUsers = await this.getInactiveUsers(3, 30);
    let sent = 0;

    for (const user of inactiveUsers) {
      const pref = await this.prisma.notificationPreference.findUnique({ where: { userId: user.id } });
      if (pref && !pref.engagementEnabled) continue;

      const dayBucket = Math.floor(Date.now() / (3 * 24 * 60 * 60 * 1000));
      const dedupKey = `reengagement_${user.id}_${dayBucket}`;
      const alreadySent = await this.prisma.notificationDelivery.findUnique({ where: { dedupKey } });
      if (alreadySent) continue;

      const template = templates[Math.floor(Math.random() * templates.length)];
      const ctx = await this.personalization.computeForUser(user.id);
      const tplCtx = this.personalization.buildTemplateContext(ctx);

      const ok = await this.delivery.send({
        userId: user.id, templateId: template.id,
        title: this.templateService.render(template.title, tplCtx),
        body: this.templateService.render(template.body, tplCtx),
        dedupKey, deepLinkScreen: template.deepLinkScreen, deepLinkData: template.deepLinkData,
      });
      if (ok) sent++;
    }
    this.logger.log(`REENGAGEMENT_BATCH: sent ${sent} notifications`);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getActiveUsers() {
    return this.prisma.user.findMany({ where: { deviceTokens: { some: {} } }, select: { id: true } });
  }

  private async getRecentlyActiveUsers(withinDays: number) {
    const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);
    const tokens = await this.prisma.deviceToken.findMany({
      where: { updatedAt: { gte: since } }, select: { userId: true }, distinct: ["userId"],
    });
    return tokens.map((t) => ({ id: t.userId }));
  }

  private async getInactiveUsers(minDays: number, maxDays: number) {
    const minCutoff = new Date(Date.now() - minDays * 24 * 60 * 60 * 1000);
    const maxCutoff = new Date(Date.now() - maxDays * 24 * 60 * 60 * 1000);
    const tokens = await this.prisma.deviceToken.findMany({
      where: { updatedAt: { lte: minCutoff, gte: maxCutoff } },
      select: { userId: true }, distinct: ["userId"],
    });
    const recentlyActiveIds = new Set((await this.getRecentlyActiveUsers(minDays)).map((u) => u.id));
    return tokens.filter((t) => !recentlyActiveIds.has(t.userId)).map((t) => ({ id: t.userId }));
  }
}
