import "server-only";

import { readJsonArray, updateJsonArray } from "@/lib/github-store";

export type RegisteredMember = {
  accountId: string;
  name: string;
  telegram: string;
  whatsapp: string;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
};

export type MemberSummary = {
  totalMembers: number;
  newMembersToday: number;
  newMembers7Days: number;
  last7Days: Array<{
    date: string;
    label: string;
    members: number;
  }>;
  recentMembers: RegisteredMember[];
};

type UpsertMemberInput = {
  accountId: string;
  name: string;
  telegram?: string;
  whatsapp: string;
};

function membersPath(): string {
  return String(
    process.env.MEMBERS_FILE || "src/data/members.json",
  ).trim();
}

function normalizeText(value: unknown, maxLength: number): string {
  return String(value || "").trim().slice(0, maxLength);
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

function memberDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : jakartaDate(parsed);
}

function normalizeMembers(values: RegisteredMember[]): RegisteredMember[] {
  const unique = new Map<string, RegisteredMember>();

  values.forEach((value) => {
    const accountId = normalizeText(value.accountId, 128);
    const name = normalizeText(value.name, 80);
    const whatsapp = normalizeText(value.whatsapp, 40);

    if (!accountId || !name || !whatsapp) {
      return;
    }

    const normalized: RegisteredMember = {
      accountId,
      name,
      telegram: normalizeText(value.telegram, 80),
      whatsapp,
      createdAt: normalizeText(value.createdAt, 64),
      updatedAt: normalizeText(value.updatedAt, 64),
      lastSeenAt: normalizeText(value.lastSeenAt, 64),
    };

    const existing = unique.get(accountId);

    if (!existing) {
      unique.set(accountId, normalized);
      return;
    }

    const existingTime = new Date(existing.updatedAt || 0).getTime();
    const nextTime = new Date(normalized.updatedAt || 0).getTime();

    if (nextTime >= existingTime) {
      unique.set(accountId, normalized);
    }
  });

  return Array.from(unique.values()).sort(
    (first, second) =>
      new Date(second.createdAt || 0).getTime() -
      new Date(first.createdAt || 0).getTime(),
  );
}

export async function upsertMember(
  input: UpsertMemberInput,
): Promise<RegisteredMember> {
  const accountId = normalizeText(input.accountId, 128);
  const name = normalizeText(input.name, 80);
  const telegram = normalizeText(input.telegram, 80);
  const whatsapp = normalizeText(input.whatsapp, 40);

  if (!accountId || !name || !whatsapp) {
    throw new Error("Data anggota belum lengkap.");
  }

  const now = new Date().toISOString();

  return updateJsonArray<RegisteredMember, RegisteredMember>(
    membersPath(),
    [],
    `members: perbarui ${accountId.slice(0, 12)}`,
    (current) => {
      const members = normalizeMembers(current);
      const existingIndex = members.findIndex(
        (member) => member.accountId === accountId,
      );
      const existing =
        existingIndex >= 0 ? members[existingIndex] : undefined;

      const record: RegisteredMember = {
        accountId,
        name,
        telegram,
        whatsapp,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        lastSeenAt: now,
      };

      const next = [...members];

      if (existingIndex >= 0) {
        next[existingIndex] = record;
      } else {
        next.unshift(record);
      }

      return {
        data: normalizeMembers(next).slice(0, 10000),
        result: record,
      };
    },
  );
}

export async function getMemberSummary(): Promise<MemberSummary> {
  const snapshot = await readJsonArray<RegisteredMember>(membersPath(), []);
  const members = normalizeMembers(snapshot.data);
  const today = jakartaDate();
  const sevenDayKeys = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return jakartaDate(date);
  });
  const sevenDaySet = new Set(sevenDayKeys);

  const counts = new Map<string, number>();

  members.forEach((member) => {
    const key = memberDate(member.createdAt);

    if (sevenDaySet.has(key)) {
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  });

  const last7Days = sevenDayKeys.map((date) => ({
    date,
    label: dateLabel(date),
    members: counts.get(date) || 0,
  }));

  return {
    totalMembers: members.length,
    newMembersToday: counts.get(today) || 0,
    newMembers7Days: last7Days.reduce(
      (total, item) => total + item.members,
      0,
    ),
    last7Days,
    recentMembers: members.slice(0, 6),
  };
}
