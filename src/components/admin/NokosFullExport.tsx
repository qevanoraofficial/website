"use client";

import { useRef, useState } from "react";

type NokosService = {
  code: string;
  name: string;
};

type NokosCountry = {
  id: number;
  name: string;
  prefix?: string;
};

type ReferenceResponse = {
  ok: boolean;
  error?: string;
  checkedAt?: string;
  totalServices?: number;
  totalCountries?: number;
  services: NokosService[];
  countries: NokosCountry[];
};

type PriceRow = {
  code: string;
  rawCost: number;
  providerPrice: number;
  stock: number;
};

type CountryPriceResponse = {
  ok: boolean;
  error?: string;
  country: number;
  server: "s1" | "s2";
  products: PriceRow[];
};

type ProgressState = {
  done: number;
  total: number;
  current: string;
  rows: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob(["\uFEFF", content], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function fetchJson<T extends { ok: boolean; error?: string }>(
  url: string,
  signal: AbortSignal,
  maxAttempts = 5,
): Promise<T> {
  let lastError = "Permintaan gagal.";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        signal,
      });

      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }

      const payload =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as T)
          : null;

      if (response.ok && payload?.ok) return payload;

      lastError =
        payload?.error ||
        `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;

      if (response.status === 401 || response.status === 403) {
        throw new Error("Session admin tidak valid atau sudah habis. Login ulang ke panel admin.");
      }

      if (attempt < maxAttempts) {
        await sleep(Math.min(5000, 700 * attempt));
        continue;
      }
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error instanceof Error ? error.message : lastError;
      if (attempt < maxAttempts) {
        await sleep(Math.min(5000, 700 * attempt));
        continue;
      }
    }
  }

  throw new Error(lastError);
}

function timestampForFilename() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export default function NokosFullExport() {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState(
    "Siap mengambil semua produk, semua negara, Server 1 dan Server 2.",
  );
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<ProgressState>({
    done: 0,
    total: 0,
    current: "",
    rows: 0,
  });
  const abortRef = useRef<AbortController | null>(null);

  async function runExport() {
    if (running) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError("");
    setProgress({ done: 0, total: 0, current: "Memuat referensi Nokos...", rows: 0 });
    setStatus("Memuat daftar layanan dan negara dari Nokos...");

    try {
      const reference = await fetchJson<ReferenceResponse>(
        "/api/nokos/export-reference",
        controller.signal,
      );

      const countries = [...reference.countries].sort(
        (a, b) => a.id - b.id || a.name.localeCompare(b.name, "id-ID"),
      );
      const serviceName = new Map(
        reference.services.map((service) => [service.code, service.name]),
      );

      const lines: string[] = [];
      lines.push(
        [
          "No",
          "Country ID",
          "Negara",
          "Prefix",
          "Kode Produk",
          "Nama Produk",
          "Raw Cost S1",
          "Harga Provider S1 (IDR)",
          "Stok S1",
          "Tersedia S1",
          "Raw Cost S2",
          "Harga Provider S2 (IDR)",
          "Stok S2",
          "Tersedia S2",
        ]
          .map(csvCell)
          .join(","),
      );

      let rowNumber = 1;
      setProgress({
        done: 0,
        total: countries.length,
        current: countries[0]?.name || "",
        rows: 0,
      });

      for (let index = 0; index < countries.length; index += 1) {
        if (controller.signal.aborted) throw new Error("Export dibatalkan.");

        const country = countries[index];
        setStatus(
          `Mengambil ${country.name} (${index + 1}/${countries.length}) — S1 + S2...`,
        );
        setProgress((current) => ({
          ...current,
          current: country.name,
        }));

        const [s1, s2] = await Promise.all([
          fetchJson<CountryPriceResponse>(
            `/api/nokos/export-country?country=${encodeURIComponent(country.id)}&server=s1`,
            controller.signal,
          ),
          fetchJson<CountryPriceResponse>(
            `/api/nokos/export-country?country=${encodeURIComponent(country.id)}&server=s2`,
            controller.signal,
          ),
        ]);

        const s1Map = new Map(s1.products.map((item) => [item.code, item]));
        const s2Map = new Map(s2.products.map((item) => [item.code, item]));
        const codes = new Set(reference.services.map((service) => service.code));
        for (const item of s1.products) codes.add(item.code);
        for (const item of s2.products) codes.add(item.code);

        const sortedCodes = [...codes].sort((a, b) => {
          const aName = serviceName.get(a) || a;
          const bName = serviceName.get(b) || b;
          return aName.localeCompare(bName, "id-ID");
        });

        for (const code of sortedCodes) {
          const priceS1 = s1Map.get(code);
          const priceS2 = s2Map.get(code);
          const name = serviceName.get(code) || code;

          lines.push(
            [
              rowNumber,
              country.id,
              country.name,
              country.prefix || "",
              code,
              name,
              priceS1 && priceS1.rawCost > 0 ? priceS1.rawCost : "",
              priceS1 && priceS1.providerPrice > 0 ? priceS1.providerPrice : "",
              priceS1 ? priceS1.stock : "",
              priceS1 && priceS1.providerPrice > 0 && priceS1.stock > 0 ? "YA" : "TIDAK",
              priceS2 && priceS2.rawCost > 0 ? priceS2.rawCost : "",
              priceS2 && priceS2.providerPrice > 0 ? priceS2.providerPrice : "",
              priceS2 ? priceS2.stock : "",
              priceS2 && priceS2.providerPrice > 0 && priceS2.stock > 0 ? "YA" : "TIDAK",
            ]
              .map(csvCell)
              .join(","),
          );
          rowNumber += 1;
        }

        setProgress({
          done: index + 1,
          total: countries.length,
          current: country.name,
          rows: rowNumber - 1,
        });

        if (index < countries.length - 1) await sleep(120);
      }

      const filename = `Harga_Nokos_Semua_Negara_S1_S2_${timestampForFilename()}.csv`;
      downloadCsv(lines.join("\r\n"), filename);
      setStatus(
        `Selesai. ${countries.length} negara dan ${(rowNumber - 1).toLocaleString("id-ID")} baris berhasil diexport.`,
      );
    } catch (runError) {
      if (controller.signal.aborted) {
        setStatus("Export dibatalkan.");
      } else {
        const message =
          runError instanceof Error ? runError.message : "Export Nokos gagal.";
        setError(message);
        setStatus("Export berhenti karena ada error. Data parsial tidak didownload.");
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(false);
    }
  }

  function cancelExport() {
    abortRef.current?.abort();
  }

  const percentage =
    progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            Export Harga Nokos Lengkap
          </h1>
          <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
            Mengambil semua layanan Nokos untuk semua negara, lalu memisahkan harga dan stok Server 1 serta Server 2 ke satu file CSV. API key tidak pernah dikirim ke browser.
          </p>
        </div>

        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          Jangan tutup halaman selama proses berjalan. Jumlah request cukup banyak karena setiap negara dicek ke S1 dan S2 secara terpisah.
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={runExport}
            disabled={running}
            className="rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? "EXPORT SEDANG BERJALAN..." : "EXPORT SEMUA NEGARA • S1 + S2"}
          </button>

          {running ? (
            <button
              type="button"
              onClick={cancelExport}
              className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              BATALKAN
            </button>
          ) : null}
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between gap-3 text-sm text-gray-600 dark:text-gray-300">
            <span>{status}</span>
            <span className="shrink-0 font-medium">{percentage}%</span>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${percentage}%` }}
            />
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/70">
              <div className="text-gray-500 dark:text-gray-400">Negara</div>
              <div className="mt-1 font-semibold text-gray-900 dark:text-white">
                {progress.done}/{progress.total || 0}
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/70">
              <div className="text-gray-500 dark:text-gray-400">Sedang diproses</div>
              <div className="mt-1 truncate font-semibold text-gray-900 dark:text-white">
                {progress.current || "-"}
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/70">
              <div className="text-gray-500 dark:text-gray-400">Baris terkumpul</div>
              <div className="mt-1 font-semibold text-gray-900 dark:text-white">
                {progress.rows.toLocaleString("id-ID")}
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
