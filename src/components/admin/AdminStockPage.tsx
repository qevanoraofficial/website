"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import type { Product } from "@/types/catalog";

type RequestState =
  | { type: "success" | "error"; message: string }
  | null;

const inputClass =
  "h-12 w-full rounded-xl border border-brand-500/20 bg-[#0b0907] px-4 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-brand-400";
const labelClass = "mb-2 block text-sm font-semibold text-[#eadcad]";

type Props = {
  initialProducts: Product[];
  initialError?: string;
};

async function readPayload(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string; product?: Product }
    | null;

  if (!response.ok || !payload?.ok || !payload.product) {
    throw new Error(payload?.error || "Permintaan gagal diproses.");
  }

  return payload.product;
}

export default function AdminStockPage({
  initialProducts,
  initialError,
}: Props) {
  const [products, setProducts] = useState(initialProducts);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<RequestState>(
    initialError ? { type: "error", message: initialError } : null,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setState(null);

    try {
      const response = await fetch("/api/qevanora-admin/products", {
        method: "PATCH",
        body: new FormData(form),
        credentials: "same-origin",
      });

      const updated = await readPayload(response);

      setProducts((current) =>
        current.map((product) =>
          product.id === updated.id ? updated : product,
        ),
      );

      setState({
        type: "success",
        message: `Stock ${updated.name} berhasil diubah menjadi ${
          Number(updated.stock) || 0
        }.`,
      });
    } catch (error) {
      setState({
        type: "error",
        message:
          error instanceof Error ? error.message : "Stock gagal diperbarui.",
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
        className="mx-auto w-full max-w-3xl rounded-3xl border border-brand-500/15 bg-[#100c09] p-5 sm:p-7"
      >
        <p className="text-sm font-semibold text-brand-300">Add Stock</p>
        <h1 className="mt-1 text-2xl font-bold">Ubah stock produk</h1>

        <div className="mt-6 space-y-4">
          <label>
            <span className={labelClass}>Pilih produk</span>
            <select
              name="id"
              required
              defaultValue=""
              className={inputClass}
            >
              <option value="" disabled>
                Pilih produk
              </option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} — stock {Number(product.stock) || 0}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className={labelClass}>Stock baru</span>
            <input
              name="stock"
              required
              type="number"
              min="0"
              step="1"
              className={inputClass}
              placeholder="Contoh: 10"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={busy || products.length === 0}
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-brand-500 px-5 text-sm font-semibold text-[#120d0a] transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Menyimpan..." : "Simpan Stock"}
        </button>
      </form>
    </main>
  );
}
