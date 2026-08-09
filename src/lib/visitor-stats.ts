import "server-only";

import { readJsonArray, updateJsonArray } from "@/lib/github-store";

export type VisitorKind = "guest" | "member";

export type DailyVisitorStat = {
  date: string;
  visitors: number;
  guests: number;
  members: number;
  updatedAt: string;
};

export type VisitorSummary = {
  totalVisitors: number;
  totalGuestVisitors: number;
  totalMemberVisitors: number;
  todayVisitors: number;
  todayGuestVisitors: number;
  todayMemberVisitors: number;
  yesterdayVisitors: number;
  last7Days: Array<{
    date: string;
    label: string;
    visitors: number;
    guests: number;
    members: number;
  }>;
};

function statsPath(): string {
  return String(
    process.env.VISITOR_STATS_FILE || "src/data/visitor-stats.json",
  ).trim();
}

function jakartaDate(value = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "00";
  const day = parts.find((part) => part.type === "day")?.value || "00";

  return `${year}-${month}-${day}`;
}

function dateLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00+07:00`);

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(parsed);
}

function normalizeStats(values: DailyVisitorStat[]): DailyVisitorStat[] {
  return values
    .filter(
      (item) =>
        /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || "")) &&
        Number.isFinite(Number(item.visitors)),
    )
    .map((item) => {
      const visitors = Math.max(
        0,
        Math.trunc(Number(item.visitors) || 0),
      );
      const rawGuests = Number(item.guests);
      const rawMembers = Number(item.members);
      const hasSplit =
        Number.isFinite(rawGuests) || Number.isFinite(rawMembers);
      const members = hasSplit
        ? Math.max(0, Math.trunc(rawMembers || 0))
        : 0;
      const guests = hasSplit
        ? Math.max(0, Math.trunc(rawGuests || 0))
        : visitors;
      const normalizedTotal = Math.max(visitors, guests + members);

      return {
        date: item.date,
        visitors: normalizedTotal,
        guests,
        members,
        updatedAt: String(item.updatedAt || ""),
      };
    })
    .sort((first, second) => first.date.localeCompare(second.date));
}

export async function recordVisitor(kind: VisitorKind): Promise<void> {
  const path = statsPath();
  const today = jakartaDate();
  const now = new Date().toISOString();

  await updateJsonArray<DailyVisitorStat, void>(
    path,
    [],
    `analytics: kunjungan ${kind} ${today}`,
    (current) => {
      const normalized = normalizeStats(current);
      const existingIndex = normalized.findIndex(
        (item) => item.date === today,
      );
      const next = [...normalized];
      const existing =
        existingIndex >= 0
          ? next[existingIndex]
          : {
              date: today,
              visitors: 0,
              guests: 0,
              members: 0,
              updatedAt: now,
            };

      const updated: DailyVisitorStat = {
        ...existing,
        visitors: existing.visitors + 1,
        guests: existing.guests + (kind === "guest" ? 1 : 0),
        members: existing.members + (kind === "member" ? 1 : 0),
        updatedAt: now,
      };

      if (existingIndex >= 0) {
        next[existingIndex] = updated;
      } else {
        next.push(updated);
      }

      return {
        data: next.slice(-180),
        result: undefined,
      };
    },
  );
}

export async function getVisitorSummary(): Promise<VisitorSummary> {
  const snapshot = await readJsonArray<DailyVisitorStat>(statsPath(), []);
  const stats = normalizeStats(snapshot.data);
  const today = jakartaDate();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = jakartaDate(yesterdayDate);
  const lookup = new Map(stats.map((item) => [item.date, item]));

  const last7Days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = jakartaDate(date);
    const value = lookup.get(key);

    return {
      date: key,
      label: dateLabel(key),
      visitors: value?.visitors || 0,
      guests: value?.guests || 0,
      members: value?.members || 0,
    };
  });

  const todayValue = lookup.get(today);

  return {
    totalVisitors: stats.reduce(
      (total, item) => total + item.visitors,
      0,
    ),
    totalGuestVisitors: stats.reduce(
      (total, item) => total + item.guests,
      0,
    ),
    totalMemberVisitors: stats.reduce(
      (total, item) => total + item.members,
      0,
    ),
    todayVisitors: todayValue?.visitors || 0,
    todayGuestVisitors: todayValue?.guests || 0,
    todayMemberVisitors: todayValue?.members || 0,
    yesterdayVisitors: lookup.get(yesterday)?.visitors || 0,
    last7Days,
  };
}
