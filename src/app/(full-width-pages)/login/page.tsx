"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CustomerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setStatus(error.message === "Invalid login credentials"
        ? "Email atau password salah."
        : error.message);
      setLoading(false);
      return;
    }

    router.replace("/profile");
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#010714] px-4 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(26,127,214,0.24),transparent_48%)]" />
      <section className="relative w-full max-w-md overflow-hidden rounded-3xl border border-brand-500/20 bg-[#031126]/95 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.5)] sm:p-8">
        <div className="flex flex-col items-center text-center">
          <Image src="/images/logo/digie-store-icon.png" alt="QEVANORA OFFICIAL" width={76} height={76} priority className="h-19 w-19 rounded-2xl object-contain" />
          <p className="mt-5 text-xs font-semibold tracking-[0.28em] text-brand-300">QEVANORA ACCOUNT</p>
          <h1 className="mt-2 text-2xl font-bold">Masuk Akun</h1>
          <p className="mt-3 text-sm leading-6 text-gray-400">Masuk untuk melihat saldo, profil, dan riwayat transaksi QEVANORA.</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <label className="block text-sm font-semibold text-gray-200">Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/25 px-4 text-white outline-none focus:border-brand-400" placeholder="nama@email.com" />
          </label>
          <label className="block text-sm font-semibold text-gray-200">Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="current-password" className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/25 px-4 text-white outline-none focus:border-brand-400" placeholder="Password" />
          </label>
          {status && <p className="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-300">{status}</p>}
          <button disabled={loading} className="h-12 w-full rounded-xl bg-brand-500 px-5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-60">{loading ? "Memproses..." : "Masuk"}</button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-400">Belum punya akun? <Link href="/register" className="font-semibold text-brand-400 hover:text-brand-300">Daftar sekarang</Link></p>
        <p className="mt-3 text-center"><Link href="/" className="text-xs text-gray-500 hover:text-gray-300">← Kembali ke QEVANORA</Link></p>
      </section>
    </main>
  );
}
