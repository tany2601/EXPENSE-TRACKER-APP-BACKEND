import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface UserNotificationContext {
  userId: string;
  name: string;

  // Current month
  monthlyIncome: number;
  monthlyExpenses: number;
  netSavings: number;

  // vs last month
  lastMonthExpenses: number;
  spendingChangePercent: number; // positive = spent more

  // Category breakdown (current month)
  topCategory: string;
  topCategoryAmount: number;
  topCategoryLastMonth: number;
  topCategoryChangePercent: number;

  // Small expenses (< ₹200 each) this month
  smallExpenseTotal: number;

  // Savings this year
  totalSavedThisYear: number;

  // Unpaid dues
  pendingDueCount: number;
  overdueDueCount: number;
  dueTomorrowTitle: string | null;
  dueTomorrowAmount: number | null;

  // Splits owed to user
  totalOwedToUser: number;
  overdueOwedCount: number;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfLastMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

function endOfLastMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59);
}

function startOfYear(d: Date) {
  return new Date(d.getFullYear(), 0, 1);
}

function tomorrow(d: Date) {
  const t = new Date(d);
  t.setDate(t.getDate() + 1);
  t.setHours(0, 0, 0, 0);
  return t;
}

function dayAfterTomorrow(d: Date) {
  const t = new Date(d);
  t.setDate(t.getDate() + 2);
  t.setHours(0, 0, 0, 0);
  return t;
}

@Injectable()
export class PersonalizationEngine {
  constructor(private prisma: PrismaService) {}

  async computeForUser(userId: string): Promise<UserNotificationContext> {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const lastMonthStart = startOfLastMonth(now);
    const lastMonthEnd = endOfLastMonth(now);
    const yearStart = startOfYear(now);
    const tomorrowStart = tomorrow(now);
    const dayAfter = dayAfterTomorrow(now);

    const [user, txThisMonth, txLastMonth, txThisYear, splits] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        }),

        this.prisma.transaction.findMany({
          where: { userId, deletedAt: null, date: { gte: monthStart } },
          select: { type: true, amount: true, category: true, dueDate: true,
                    isPaid: true, title: true },
        }),

        this.prisma.transaction.findMany({
          where: {
            userId, deletedAt: null,
            date: { gte: lastMonthStart, lte: lastMonthEnd },
          },
          select: { type: true, amount: true, category: true },
        }),

        this.prisma.transaction.findMany({
          where: { userId, deletedAt: null, date: { gte: yearStart },
                   type: "INCOME" },
          select: { amount: true },
        }),

        this.prisma.transactionSplit.findMany({
          where: {
            transaction: { userId, deletedAt: null },
            isPaid: false,
          },
          select: { amount: true, transaction: { select: { date: true } } },
        }),
      ]);

    // ── Monthly income / expenses ──
    const monthlyIncome = txThisMonth
      .filter((t) => t.type === "INCOME")
      .reduce((s, t) => s + t.amount, 0);

    const monthlyExpenses = txThisMonth
      .filter((t) => t.type === "EXPENSE")
      .reduce((s, t) => s + t.amount, 0);

    const netSavings = monthlyIncome - monthlyExpenses;

    // ── Last month expenses ──
    const lastMonthExpenses = txLastMonth
      .filter((t) => t.type === "EXPENSE")
      .reduce((s, t) => s + t.amount, 0);

    const spendingChangePercent =
      lastMonthExpenses > 0
        ? Math.round(((monthlyExpenses - lastMonthExpenses) / lastMonthExpenses) * 100)
        : 0;

    // ── Top category this month ──
    const catMap: Record<string, number> = {};
    txThisMonth
      .filter((t) => t.type === "EXPENSE")
      .forEach((t) => {
        catMap[t.category] = (catMap[t.category] ?? 0) + t.amount;
      });

    let topCategory = "";
    let topCategoryAmount = 0;
    for (const [cat, amt] of Object.entries(catMap)) {
      if (amt > topCategoryAmount) {
        topCategory = cat;
        topCategoryAmount = amt;
      }
    }

    const catMapLast: Record<string, number> = {};
    txLastMonth
      .filter((t) => t.type === "EXPENSE")
      .forEach((t) => {
        catMapLast[t.category] = (catMapLast[t.category] ?? 0) + t.amount;
      });

    const topCategoryLastMonth = catMapLast[topCategory] ?? 0;
    const topCategoryChangePercent =
      topCategoryLastMonth > 0
        ? Math.round(
            ((topCategoryAmount - topCategoryLastMonth) / topCategoryLastMonth) * 100
          )
        : 0;

    // ── Small expenses (< ₹200) ──
    const smallExpenseTotal = txThisMonth
      .filter((t) => t.type === "EXPENSE" && t.amount < 200)
      .reduce((s, t) => s + t.amount, 0);

    // ── Yearly savings (income YTD - expenses YTD) ──
    const yearlyIncome = txThisYear.reduce((s, t) => s + t.amount, 0);
    const totalSavedThisYear = Math.max(0, yearlyIncome - monthlyExpenses);

    // ── Due payments ──
    const unpaidDues = txThisMonth
      .filter((t) => t.type === "EXPENSE" && t.isPaid === false && t.dueDate);

    const pendingDueCount = unpaidDues.filter(
      (t) => new Date(t.dueDate!) >= now
    ).length;

    const overdueDueCount = unpaidDues.filter(
      (t) => new Date(t.dueDate!) < now
    ).length;

    const dueTomorrow = unpaidDues.find((t) => {
      const d = new Date(t.dueDate!);
      return d >= tomorrowStart && d < dayAfter;
    });

    // ── Splits owed to user ──
    const overdueDate = new Date(now);
    overdueDate.setDate(overdueDate.getDate() - 7);

    const totalOwedToUser = splits.reduce((s, sp) => s + sp.amount, 0);
    const overdueOwedCount = splits.filter(
      (sp) => new Date(sp.transaction.date) < overdueDate
    ).length;

    return {
      userId,
      name: user?.name ?? "",
      monthlyIncome: Math.round(monthlyIncome),
      monthlyExpenses: Math.round(monthlyExpenses),
      netSavings: Math.round(netSavings),
      lastMonthExpenses: Math.round(lastMonthExpenses),
      spendingChangePercent,
      topCategory,
      topCategoryAmount: Math.round(topCategoryAmount),
      topCategoryLastMonth: Math.round(topCategoryLastMonth),
      topCategoryChangePercent,
      smallExpenseTotal: Math.round(smallExpenseTotal),
      totalSavedThisYear: Math.round(totalSavedThisYear),
      pendingDueCount,
      overdueDueCount,
      dueTomorrowTitle: dueTomorrow?.title ?? null,
      dueTomorrowAmount: dueTomorrow ? Math.round(dueTomorrow.amount) : null,
      totalOwedToUser: Math.round(totalOwedToUser),
      overdueOwedCount,
    };
  }

  // Check if a template's condition is satisfied by the context
  meetsCondition(condition: string | null, ctx: UserNotificationContext): boolean {
    if (!condition) return true; // no condition = always send (ENGAGEMENT)

    let parsed: { metric: string; threshold?: number };
    try {
      parsed = JSON.parse(condition);
    } catch {
      return false;
    }

    switch (parsed.metric) {
      case "spending_spike":
        return ctx.spendingChangePercent >= (parsed.threshold ?? 20);
      case "top_category_spike":
        return ctx.topCategoryChangePercent >= (parsed.threshold ?? 30);
      case "has_due_tomorrow":
        return ctx.dueTomorrowTitle !== null;
      case "has_overdue":
        return ctx.overdueDueCount > 0;
      case "has_pending_splits":
        return ctx.totalOwedToUser > 0;
      case "has_overdue_splits":
        return ctx.overdueOwedCount > 0;
      case "small_expenses":
        return ctx.smallExpenseTotal >= (parsed.threshold ?? 1000);
      case "positive_savings":
        return ctx.netSavings > 0;
      case "savings_milestone":
        const milestones = [5000, 10000, 25000, 50000, 100000];
        return milestones.some(
          (m) => ctx.totalSavedThisYear >= m && ctx.totalSavedThisYear < m * 2
        );
      default:
        return false;
    }
  }

  // Build template context object from UserNotificationContext
  buildTemplateContext(ctx: UserNotificationContext): Record<string, string | number> {
    return {
      name: ctx.name,
      monthly_expenses: ctx.monthlyExpenses,
      monthly_income: ctx.monthlyIncome,
      net_savings: ctx.netSavings,
      spending_change_pct: Math.abs(ctx.spendingChangePercent),
      top_category: ctx.topCategory,
      top_category_amount: ctx.topCategoryAmount,
      top_category_change_pct: Math.abs(ctx.topCategoryChangePercent),
      small_expense_total: ctx.smallExpenseTotal,
      total_saved_year: ctx.totalSavedThisYear,
      due_tomorrow_title: ctx.dueTomorrowTitle ?? "",
      due_tomorrow_amount: ctx.dueTomorrowAmount ?? 0,
      total_owed: ctx.totalOwedToUser,
    };
  }
}
