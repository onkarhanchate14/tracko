import { Expense } from "./database";
import { money } from "./theme";

export type AnalyticsFilter = {
  category: string | null;
  person: string | null;
  tag: string | null;
};

export const emptyFilter: AnalyticsFilter = {
  category: null,
  person: null,
  tag: null,
};

export type Bucket = {
  name: string;
  total: number;
  count: number;
  pct: number;
};
export type MerchantBucket = { merchant: string; total: number; count: number };
export type WeekdayBucket = { day: string; total: number };

export type Insight = {
  id: string;
  tone: "good" | "warn" | "neutral";
  title: string;
  detail: string;
};

export type Analytics = {
  total: number;
  count: number;
  average: number;
  thisMonth: number;
  lastMonth: number;
  monthChangePct: number | null;
  thisWeek: number;
  lastWeek: number;
  dailyAverageThisMonth: number;
  projectedThisMonth: number;
  byCategory: Bucket[];
  byPerson: Bucket[];
  byTag: Bucket[];
  topMerchants: MerchantBucket[];
  byWeekday: WeekdayBucket[];
  biggest: Expense | null;
  insights: Insight[];
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function filterExpenses(
  expenses: Expense[],
  filter: AnalyticsFilter,
): Expense[] {
  return expenses.filter((expense) => {
    if (filter.category && expense.category !== filter.category) return false;
    if (filter.person && expense.person !== filter.person) return false;
    if (filter.tag && (expense.tag ?? "") !== filter.tag) return false;
    return true;
  });
}

export function distinctTags(expenses: Expense[]): string[] {
  const set = new Set<string>();
  for (const expense of expenses) {
    const value = (expense.tag ?? "").trim();
    if (value) set.add(value);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

function bucketBy(
  expenses: Expense[],
  pick: (expense: Expense) => string | null,
): Bucket[] {
  const totals = new Map<string, { total: number; count: number }>();
  let grand = 0;
  for (const expense of expenses) {
    const key = pick(expense);
    if (!key) continue;
    const current = totals.get(key) ?? { total: 0, count: 0 };
    current.total += expense.amount;
    current.count += 1;
    totals.set(key, current);
    grand += expense.amount;
  }
  return [...totals.entries()]
    .map(([name, value]) => ({
      name,
      total: value.total,
      count: value.count,
      pct: grand > 0 ? (value.total / grand) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

function startOfDay(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

export function computeAnalytics(expenses: Expense[]): Analytics {
  const now = new Date();
  const startToday = startOfDay(now);
  const startWeek = startToday - ((now.getDay() + 6) % 7) * 86_400_000;
  const startLastWeek = startWeek - 7 * 86_400_000;
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const startLastMonth = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    1,
  ).getTime();

  let total = 0;
  let thisMonth = 0;
  let lastMonth = 0;
  let thisWeek = 0;
  let lastWeek = 0;
  let biggest: Expense | null = null;
  const weekdayTotals = new Array(7).fill(0);

  for (const expense of expenses) {
    const at = new Date(expense.occurredAt).getTime();
    total += expense.amount;
    if (at >= startMonth) thisMonth += expense.amount;
    else if (at >= startLastMonth && at < startMonth)
      lastMonth += expense.amount;
    if (at >= startWeek) thisWeek += expense.amount;
    else if (at >= startLastWeek && at < startWeek) lastWeek += expense.amount;
    weekdayTotals[new Date(at).getDay()] += expense.amount;
    if (!biggest || expense.amount > biggest.amount) biggest = expense;
  }

  const count = expenses.length;
  const average = count > 0 ? total / count : 0;

  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();
  const dailyAverageThisMonth = dayOfMonth > 0 ? thisMonth / dayOfMonth : 0;
  const projectedThisMonth = dailyAverageThisMonth * daysInMonth;

  const monthChangePct =
    lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null;

  const byCategory = bucketBy(expenses, (e) => e.category);
  const byPerson = bucketBy(expenses, (e) => e.person);
  const byTag = bucketBy(expenses, (e) => (e.tag ?? "").trim() || null);

  const merchantTotals = new Map<string, { total: number; count: number }>();
  for (const expense of expenses) {
    const current = merchantTotals.get(expense.merchant) ?? {
      total: 0,
      count: 0,
    };
    current.total += expense.amount;
    current.count += 1;
    merchantTotals.set(expense.merchant, current);
  }
  const topMerchants: MerchantBucket[] = [...merchantTotals.entries()]
    .map(([merchant, value]) => ({ merchant, ...value }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const byWeekday: WeekdayBucket[] = weekdayTotals.map((value, index) => ({
    day: WEEKDAYS[index],
    total: value,
  }));

  const insights = buildInsights({
    count,
    thisMonth,
    lastMonth,
    monthChangePct,
    thisWeek,
    lastWeek,
    projectedThisMonth,
    dailyAverageThisMonth,
    byCategory,
    byWeekday,
    topMerchants,
    biggest,
  });

  return {
    total,
    count,
    average,
    thisMonth,
    lastMonth,
    monthChangePct,
    thisWeek,
    lastWeek,
    dailyAverageThisMonth,
    projectedThisMonth,
    byCategory,
    byPerson,
    byTag,
    topMerchants,
    byWeekday,
    biggest,
    insights,
  };
}

function buildInsights(data: {
  count: number;
  thisMonth: number;
  lastMonth: number;
  monthChangePct: number | null;
  thisWeek: number;
  lastWeek: number;
  projectedThisMonth: number;
  dailyAverageThisMonth: number;
  byCategory: Bucket[];
  byWeekday: WeekdayBucket[];
  topMerchants: MerchantBucket[];
  biggest: Expense | null;
}): Insight[] {
  const insights: Insight[] = [];
  if (data.count === 0) return insights;

  if (data.monthChangePct !== null && Math.abs(data.monthChangePct) >= 1) {
    const up = data.monthChangePct > 0;
    insights.push({
      id: "month-trend",
      tone: up ? "warn" : "good",
      title: up
        ? `Spending up ${Math.round(data.monthChangePct)}% vs last month`
        : `Spending down ${Math.round(Math.abs(data.monthChangePct))}% vs last month`,
      detail: `${money(data.thisMonth)} so far this month against ${money(
        data.lastMonth,
      )} last month.`,
    });
  }

  if (data.projectedThisMonth > 0) {
    insights.push({
      id: "projection",
      tone: "neutral",
      title: `On track for ~${money(data.projectedThisMonth)} this month`,
      detail: `Based on an average of ${money(
        data.dailyAverageThisMonth,
      )} per day so far.`,
    });
  }

  const topCategory = data.byCategory[0];
  if (topCategory) {
    insights.push({
      id: "top-category",
      tone: "neutral",
      title: `${topCategory.name} is your biggest category`,
      detail: `${money(topCategory.total)} (${Math.round(
        topCategory.pct,
      )}% of tracked spend).`,
    });
  }

  const topMerchant = data.topMerchants[0];
  if (topMerchant && topMerchant.count >= 2) {
    insights.push({
      id: "top-merchant",
      tone: "neutral",
      title: `Most visited: ${topMerchant.merchant}`,
      detail: `${topMerchant.count} payments totalling ${money(
        topMerchant.total,
      )}.`,
    });
  }

  const busiestDay = [...data.byWeekday].sort((a, b) => b.total - a.total)[0];
  if (busiestDay && busiestDay.total > 0) {
    insights.push({
      id: "busiest-day",
      tone: "neutral",
      title: `${busiestDay.day} is your heaviest spending day`,
      detail: `You tend to spend the most on ${busiestDay.day}s.`,
    });
  }

  if (data.biggest) {
    insights.push({
      id: "biggest",
      tone: "neutral",
      title: `Largest expense: ${money(data.biggest.amount)}`,
      detail: `${data.biggest.merchant} · ${data.biggest.category}.`,
    });
  }

  return insights;
}
