"use client";

import { useEffect, useMemo, useState } from "react";

const TIME_ZONE = "Asia/Jakarta";
const OPEN_MINUTES = 9 * 60;
const CLOSE_MINUTES = 21 * 60;

const DAY_INDEX: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 0,
};

const schedule = [
  ["Senin", "09:00 - 21:00"],
  ["Selasa", "09:00 - 21:00"],
  ["Rabu", "09:00 - 21:00"],
  ["Kamis", "09:00 - 21:00"],
  ["Jum'at", "09:00 - 21:00"],
  ["Sabtu", "09:00 - 21:00"],
  ["Minggu", "LIBUR"],
] as const;

function getJakartaClock(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(value.hour || 0);
  const minute = Number(value.minute || 0);
  const second = Number(value.second || 0);
  const dayIndex = DAY_INDEX[value.weekday] ?? 0;

  return {
    dayIndex,
    hour,
    minute,
    second,
    minutes: hour * 60 + minute,
  };
}

export default function StoreHoursStatus() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    update();

    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const status = useMemo(() => {
    if (!now) return null;

    const clock = getJakartaClock(now);
    const isSunday = clock.dayIndex === 0;
    const isOpen =
      !isSunday &&
      clock.minutes >= OPEN_MINUTES &&
      clock.minutes < CLOSE_MINUTES;

    const dateText = new Intl.DateTimeFormat("id-ID", {
      timeZone: TIME_ZONE,
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(now);

    const timeText = new Intl.DateTimeFormat("id-ID", {
      timeZone: TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(now);

    let message = "";
    if (isSunday) {
      message = "Hari Minggu libur. Toko buka kembali Senin pukul 09:00 WIB.";
    } else if (clock.minutes < OPEN_MINUTES) {
      message = "Toko belum buka. Buka hari ini pukul 09:00 WIB.";
    } else if (isOpen) {
      message = "Toko sedang buka dan melayani pesanan sampai pukul 21:00 WIB.";
    } else {
      message = "Jam operasional hari ini sudah selesai. Buka kembali pukul 09:00 WIB.";
    }

    return {
      ...clock,
      isSunday,
      isOpen,
      dateText,
      timeText,
      message,
    };
  }, [now]);

  if (!status) {
    return (
      <section className="mb-0 animate-pulse rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="h-5 w-36 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="mt-3 h-8 w-52 rounded bg-gray-200 dark:bg-gray-800" />
      </section>
    );
  }

  return (
    <section className="mb-0 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">
                Jam Operasional QEVANORA
              </p>
              <h2 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
                {status.timeText} <span className="text-base font-semibold text-gray-400">WIB</span>
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {status.dateText}
              </p>
            </div>

            <span
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold ${
                status.isOpen
                  ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
                  : "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400"
              }`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  status.isOpen
                    ? "bg-success-500 motion-safe:animate-pulse"
                    : "bg-error-500"
                }`}
              />
              {status.isOpen ? "TOKO BUKA" : status.isSunday ? "LIBUR" : "TOKO TUTUP"}
            </span>
          </div>

          <p className="mt-5 rounded-xl bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-600 dark:bg-white/[0.04] dark:text-gray-300">
            {status.message}
          </p>
        </div>

        <div className="border-t border-gray-200 bg-gray-50/70 p-5 dark:border-gray-800 dark:bg-white/[0.02] sm:p-6 lg:border-l lg:border-t-0">
          <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Jadwal Mingguan
          </p>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {schedule.map(([day, hours]) => (
              <div
                key={day}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs dark:border-gray-800 dark:bg-white/[0.03]"
              >
                <span className="font-semibold text-gray-700 dark:text-gray-300">{day}</span>
                <span
                  className={
                    hours === "LIBUR"
                      ? "font-bold text-error-500"
                      : "font-medium text-gray-500 dark:text-gray-400"
                  }
                >
                  {hours}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
