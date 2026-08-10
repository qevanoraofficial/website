"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CustomerRegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [telegram, setTelegram] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus("");

    if (password.length < 8) {
      setStatus("Password minimal 8 karakter.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: name.trim(),
          phone: whatsapp.trim(),
          telegram_id: telegram.trim(),
        },
      },
    });

    if (error) {
      setStatus(error.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      router.replace("/profile");
      router.refresh();
      return;
    }

    setStatus("Akun dibuat. Cek email kamu lalu tekan link konfirmasi untuk mengaktifkan akun.");
    setLoading(false);
  }

  const inputClass = "mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/25 px-4 text-white outline-none focus:border-brand-400";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#010714] px-4 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(26,127,214,0.24),transparent_48%)]" />
      <section className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-brand-500/20 bg-[#031126]/95 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.5)] sm:p-8">
        <div className="flex flex-col items-center text-center">
          <Image src="/images/logo/digie-store-icon.png" alt="QEVANORA OFFICIAL" width={76} height={76} priority className="h-19 w-19 rounded-2xl object-contain" />
          <p className="mt-5 text-xs font-semibold tracking-[0.28em] text-brand-300">QEVANORA ACCOUNT</p>
          <h1 className="mt-2 text-2xl font-bold">Buat Akun</h1>
          <p className="mt-3 text-sm leading-6 text-gray-400">Satu akun untuk saldo, order, refund, dan seluruh layanan QEVANORA.</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-gray-200 sm:col-span-2">Nama
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} className={inputClass} placeholder="Nama kamu" />
          </label>
          <label className="block text-sm font-semibold text-gray-200 sm:col-span-2">Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className={inputClass} placeholder="nama@email.com" />
          </label>
          <label className="block text-sm font-semibold text-gray-200">WhatsApp
            <input type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} required maxLength={40} className={inputClass} placeholder="08xxxxxxxxxx" />
          </label>
          <label className="block text-sm font-semibold text-gray-200">Telegram <span className="font-normal text-gray-500">(opsional)</span>
            <input value={telegram} onChange={(e) => setTelegram(e.target.value)} maxLength={80} className={inputClass} placeholder="@username" />
          </label>
          <label className="block text-sm font-semibold text-gray-200 sm:col-span-2">Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" className={inputClass} placeholder="Minimal 8 karakter" />
          </label>
          {status && <p className="sm:col-span-2 rounded-xl border border-brand-500/25 bg-brand-500/10 px-4 py-3 text-sm leading-6 text-gray-200">{status}</p>}
          <button disabled={loading} className="sm:col-span-2 h-12 w-full rounded-xl bg-brand-500 px-5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-60">{loading ? "Membuat akun..." : "Daftar QEVANORA"}</button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-400">Sudah punya akun? <Link href="/login" className="font-semibold text-brand-400 hover:text-brand-300">Masuk</Link></p>
        <p className="mt-3 text-center"><Link href="/" className="text-xs text-gray-500 hover:text-gray-300">← Kembali ke QEVANORA</Link></p>
      </section>
    </main>
  );
}
