import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const templates = [
    // ── ENGAGEMENT_BATCH — Zomato-style witty messages ──────────────────────
    {
      name: "Wallet survivor",
      type: "ENGAGEMENT",
      triggerCategory: "ENGAGEMENT_BATCH",
      title: "Daily check-in 💸",
      body: "Your wallet survived another day. Barely.",
      dedupWindowDays: 7,
      sortOrder: 1,
    },
    {
      name: "Expenses overtime",
      type: "ENGAGEMENT",
      triggerCategory: "ENGAGEMENT_BATCH",
      title: "Heads up, {{name}} 👀",
      body: "Your expenses are working overtime this week.",
      dedupWindowDays: 7,
      sortOrder: 2,
    },
    {
      name: "Future You thanks",
      type: "ENGAGEMENT",
      triggerCategory: "ENGAGEMENT_BATCH",
      title: "Message from the future ✉️",
      body: "Future You just sent a thank-you note. Keep saving.",
      dedupWindowDays: 7,
      sortOrder: 3,
    },
    {
      name: "Coffee habit",
      type: "ENGAGEMENT",
      triggerCategory: "ENGAGEMENT_BATCH",
      title: "Just a thought ☕",
      body: "That coffee wasn't expensive. The daily habit is.",
      dedupWindowDays: 7,
      sortOrder: 4,
    },
    {
      name: "Money memory",
      type: "ENGAGEMENT",
      triggerCategory: "ENGAGEMENT_BATCH",
      title: "Rupexo reminder 🧠",
      body: "Money doesn't remember who spent it. Your app does.",
      dedupWindowDays: 7,
      sortOrder: 5,
    },
    {
      name: "Future self approve",
      type: "ENGAGEMENT",
      triggerCategory: "ENGAGEMENT_BATCH",
      title: "Good call 👏",
      body: "You saved money today. Your future self approves.",
      dedupWindowDays: 7,
      sortOrder: 6,
    },
    {
      name: "Budget check",
      type: "ENGAGEMENT",
      triggerCategory: "ENGAGEMENT_BATCH",
      title: "Rupexo says hi 👋",
      body: "Checking in on your wallet. It says it misses you.",
      dedupWindowDays: 7,
      sortOrder: 7,
    },
    {
      name: "Sneaky small expenses",
      type: "ENGAGEMENT",
      triggerCategory: "ENGAGEMENT_BATCH",
      title: "Sneaky sneaky 🕵️",
      body: "The ₹50 here, ₹80 there kind of spending adds up fast.",
      dedupWindowDays: 7,
      sortOrder: 8,
    },

    // ── DAILY_ALERTS — Due payment + overdue + split alerts ──────────────────
    {
      name: "Due tomorrow alert",
      type: "ALERT",
      triggerCategory: "DAILY_ALERTS",
      title: "Payment due tomorrow ⏰",
      body: "{{due_tomorrow_title}} — ₹{{due_tomorrow_amount}} is due tomorrow. Don't miss it.",
      condition: JSON.stringify({ metric: "has_due_tomorrow" }),
      deepLinkScreen: "/receivables",
      deepLinkData: JSON.stringify({ filter: "UPCOMING" }),
      dedupWindowDays: 1,
      priority: "HIGH",
      sortOrder: 1,
    },
    {
      name: "Overdue payment",
      type: "ALERT",
      triggerCategory: "DAILY_ALERTS",
      title: "Overdue payment 🔴",
      body: "You have overdue payments. Tap to clear them up.",
      condition: JSON.stringify({ metric: "has_overdue" }),
      deepLinkScreen: "/receivables",
      deepLinkData: JSON.stringify({ filter: "OVERDUE" }),
      dedupWindowDays: 1,
      priority: "HIGH",
      sortOrder: 2,
    },
    {
      name: "Pending splits",
      type: "ALERT",
      triggerCategory: "DAILY_ALERTS",
      title: "Money owed to you 💰",
      body: "₹{{total_owed}} is still owed to you. Time for a nudge?",
      condition: JSON.stringify({ metric: "has_pending_splits" }),
      deepLinkScreen: "/receivables",
      deepLinkData: JSON.stringify({ filter: "SPLITS" }),
      dedupWindowDays: 3,
      sortOrder: 3,
    },
    {
      name: "Overdue splits",
      type: "ALERT",
      triggerCategory: "DAILY_ALERTS",
      title: "Old split pending 🤔",
      body: "Someone owes you ₹{{total_owed}} from over a week ago.",
      condition: JSON.stringify({ metric: "has_overdue_splits" }),
      deepLinkScreen: "/receivables",
      deepLinkData: JSON.stringify({ filter: "SPLITS" }),
      dedupWindowDays: 2,
      priority: "HIGH",
      sortOrder: 4,
    },

    // ── WEEKLY_INSIGHTS — Spending patterns ──────────────────────────────────
    {
      name: "Spending spike",
      type: "INSIGHT",
      triggerCategory: "WEEKLY_INSIGHTS",
      title: "Spending spike detected 📈",
      body: "Your {{top_category}} spending is {{top_category_change_pct}}% higher than last month.",
      condition: JSON.stringify({ metric: "top_category_spike", threshold: 30 }),
      deepLinkScreen: "/statistics",
      dedupWindowDays: 14,
      sortOrder: 1,
    },
    {
      name: "Top category habit",
      type: "INSIGHT",
      triggerCategory: "WEEKLY_INSIGHTS",
      title: "Your top spend category 🏆",
      body: "You've spent ₹{{top_category_amount}} on {{top_category}} this month. Intentional or habit?",
      deepLinkScreen: "/statistics",
      dedupWindowDays: 14,
      sortOrder: 2,
    },
    {
      name: "Small expenses add up",
      type: "INSIGHT",
      triggerCategory: "WEEKLY_INSIGHTS",
      title: "Small leaks, big damage 💧",
      body: "Small expenses added up to ₹{{small_expense_total}} this month. They sneak up.",
      condition: JSON.stringify({ metric: "small_expenses", threshold: 1000 }),
      deepLinkScreen: "/statistics",
      dedupWindowDays: 14,
      sortOrder: 3,
    },
    {
      name: "On track to save",
      type: "INSIGHT",
      triggerCategory: "WEEKLY_INSIGHTS",
      title: "You're doing great 🎯",
      body: "You're on track to beat last month's savings. Keep it up!",
      condition: JSON.stringify({ metric: "positive_savings" }),
      deepLinkScreen: "/home",
      dedupWindowDays: 14,
      sortOrder: 4,
    },
    {
      name: "Overall spending up",
      type: "INSIGHT",
      triggerCategory: "WEEKLY_INSIGHTS",
      title: "Spending check 📊",
      body: "Your spending is {{spending_change_pct}}% higher than last month. Worth a look.",
      condition: JSON.stringify({ metric: "spending_spike", threshold: 20 }),
      deepLinkScreen: "/statistics",
      dedupWindowDays: 14,
      sortOrder: 5,
    },

    // ── MONTHLY_MILESTONES ────────────────────────────────────────────────────
    {
      name: "Savings milestone",
      type: "INSIGHT",
      triggerCategory: "MONTHLY_MILESTONES",
      title: "Savings milestone 🏅",
      body: "You've saved ₹{{total_saved_year}} this year. Future {{name}} is proud.",
      condition: JSON.stringify({ metric: "savings_milestone" }),
      deepLinkScreen: "/statistics",
      dedupWindowDays: 30,
      priority: "HIGH",
      sortOrder: 1,
    },
    {
      name: "Monthly net positive",
      type: "INSIGHT",
      triggerCategory: "MONTHLY_MILESTONES",
      title: "Month in review 📅",
      body: "You ended the month with ₹{{net_savings}} in savings. Not bad at all.",
      condition: JSON.stringify({ metric: "positive_savings" }),
      deepLinkScreen: "/home",
      dedupWindowDays: 30,
      sortOrder: 2,
    },
  ];

  let created = 0;
  for (const t of templates) {
    const exists = await prisma.notificationTemplate.findFirst({
      where: { name: t.name },
    });
    if (!exists) {
      await prisma.notificationTemplate.create({ data: t });
      created++;
    }
  }

  console.log(`Seeded ${created} notification templates (${templates.length - created} already existed)`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
