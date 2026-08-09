import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin-auth";
import type { Metadata } from "next";
import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Secure Access | QEVANORA OFFICIAL",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function AdminLoginPage({
  searchParams,
}: LoginPageProps) {
  const cookieStore = await cookies();
  const currentSession = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (verifyAdminSessionToken(currentSession)) {
    redirect("/qevanora-control/panel");
  }

  const { error } = await searchParams;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#010714] px-4 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(214,166,47,0.18),transparent_46%)]" />

      <section className="relative w-full max-w-md overflow-hidden rounded-3xl border border-brand-500/20 bg-[#031126]/95 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.5)] backdrop-blur sm:p-8">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-300/80 to-transparent" />

        <div className="flex flex-col items-center text-center">
          <Image
            src="/images/logo/digie-store-icon.png"
            alt="Logo QEVANORA OFFICIAL"
            width={76}
            height={76}
            priority
            className="h-19 w-19 rounded-2xl object-contain"
          />
          <p className="mt-5 text-xs font-semibold tracking-[0.28em] text-brand-300">
            SECURE ACCESS
          </p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
            Admin Panel
          </h1>
          <p className="mt-3 text-sm leading-6 text-gray-400">
            Masukkan password administrator untuk melanjutkan.
          </p>
        </div>

        {error === "invalid" && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-300"
          >
            Password admin salah.
          </div>
        )}

        {error === "config" && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm leading-6 text-error-300"
          >
            Secret sesi admin belum tersedia. Pastikan ORDER_SESSION_SECRET atau
            ADMIN_SESSION_SECRET sudah diatur di Vercel.
          </div>
        )}

        <form
          action="/api/qevanora-admin/login"
          method="post"
          className="mt-6"
        >
          <label
            htmlFor="admin-password"
            className="text-sm font-semibold text-gray-200"
          >
            Password
          </label>
          <input
            id="admin-password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            autoFocus
            className="mt-2 h-12 w-full rounded-xl border border-brand-500/20 bg-black/25 px-4 text-white outline-none transition placeholder:text-gray-600 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
            placeholder="Masukkan password admin"
          />

          <button
            type="submit"
            className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-xl bg-brand-500 px-5 text-sm font-bold text-[#031126] transition hover:bg-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/20"
          >
            Masuk ke Admin Panel
          </button>
        </form>

        <p className="mt-6 text-center text-xs leading-5 text-gray-600">
          Halaman ini tidak ditampilkan pada menu website dan tidak diindeks
          mesin pencari.
        </p>
      </section>
    </main>
  );
}
