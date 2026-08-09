"use client";

import type { FormEvent } from "react";
import { useState } from "react";

type RequestState =
  | { type: "success" | "error"; message: string }
  | null;

const inputClass =
  "h-12 w-full rounded-xl border border-brand-500/20 bg-[#020b18] px-4 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-brand-400";
const textareaClass =
  "min-h-28 w-full resize-y rounded-xl border border-brand-500/20 bg-[#020b18] px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-brand-400";
const labelClass = "mb-2 block text-sm font-semibold text-[#f7e6a8]";

async function readPayload(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string }
    | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "Permintaan gagal diproses.");
  }
}

export default function AdminAddProductPage() {
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<RequestState>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setState(null);

    try {
      const response = await fetch("/api/qevanora-admin/products", {
        method: "POST",
        body: new FormData(form),
        credentials: "same-origin",
      });

      await readPayload(response);
      form.reset();
      setState({
        type: "success",
        message: "Produk berhasil ditambahkan.",
      });
    } catch (error) {
      setState({
        type: "error",
        message:
          error instanceof Error ? error.message : "Produk gagal ditambahkan.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="w-full min-w-0 text-white">
      {state && (
        <div
          role="status"
          className={`mb-5 rounded-2xl border px-4 py-3 text-sm font-medium ${
            state.type === "success"
              ? "border-success-500/30 bg-success-500/10 text-success-300"
              : "border-error-500/30 bg-error-500/10 text-error-300"
          }`}
        >
          {state.message}
        </div>
      )}

      <form
        onSubmit={submit}
        className="mx-auto w-full max-w-3xl rounded-3xl border border-brand-500/15 bg-[#031126] p-5 sm:p-7"
      >
        <p className="text-sm font-semibold text-brand-300">Tambah Produk</p>
        <h1 className="mt-1 text-2xl font-bold">Produk baru</h1>

        <div className="mt-6 space-y-4">
          <label>
            <span className={labelClass}>Nama produk</span>
            <input
              name="name"
              required
              maxLength={160}
              className={inputClass}
              placeholder="Nama produk"
            />
          </label>

          <label>
            <span className={labelClass}>Kategori</span>
            <input
              name="categoryName"
              required
              maxLength={120}
              className={inputClass}
              placeholder="Contoh: Minecraft Addon"
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label>
              <span className={labelClass}>Harga</span>
              <input
                name="price"
                required
                type="number"
                min="0"
                step="1"
                className={inputClass}
                placeholder="0"
              />
            </label>

            <label>
              <span className={labelClass}>Stok</span>
              <input
                name="stock"
                required
                type="number"
                min="0"
                step="1"
                className={inputClass}
                placeholder="0"
              />
            </label>
          </div>

          <label>
            <span className={labelClass}>Deskripsi singkat</span>
            <textarea
              name="shortDescription"
              required
              maxLength={1000}
              className={textareaClass}
              placeholder="Ringkasan produk"
            />
          </label>

          <label>
            <span className={labelClass}>Deskripsi lengkap</span>
            <textarea
              name="fullDescription"
              required
              maxLength={6000}
              className={`${textareaClass} min-h-40`}
              placeholder="Detail lengkap produk"
            />
          </label>

          <label>
            <span className={labelClass}>Gambar produk</span>
            <input
              name="image"
              required
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="block w-full rounded-xl border border-brand-500/20 bg-[#020b18] p-3 text-sm text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500 file:px-4 file:py-2 file:font-semibold file:text-[#031126]"
            />
            <span className="mt-2 block text-xs text-gray-600">
              JPG, PNG, atau WEBP. Maksimal 4 MB.
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-brand-500 px-5 text-sm font-semibold text-[#031126] transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Menyimpan..." : "Tambah Produk"}
        </button>
      </form>
    </main>
  );
}
