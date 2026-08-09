import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Free Bedrock Authority | QEVANORA OFFICIAL",
  description: "Halaman FREE BEDROCK AUTHORITY QEVANORA OFFICIAL.",
};

export default function FreeBedrockAuthorityPage() {
  return (
    <main className="w-full min-w-0">
      <section className="relative overflow-hidden rounded-3xl border border-brand-500/15 bg-white/[0.025] p-5 sm:p-7 lg:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(214,166,47,0.14),transparent_48%)]" />

        <div className="relative">
          <p className="text-xs font-semibold tracking-[0.28em] text-brand-400">
            QEVANORA OFFICIAL
          </p>

          <h1 className="mt-3 break-words text-2xl font-bold text-white sm:text-3xl">
            ꜰʀᴇᴇ ʙᴇᴅʀᴏᴄᴋ ᴀᴜᴛʜᴏʀɪᴛʏ
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-7 text-gray-400 sm:text-base">
            Halaman khusus konten FREE BEDROCK AUTHORITY.
          </p>
        </div>
      </section>

      <section className="mt-5 rounded-3xl border border-brand-500/15 bg-[#031126] px-5 py-12 text-center sm:px-7">
        <h2 className="text-lg font-semibold text-white">
          Belum ada konten
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-400">
          Konten FREE BEDROCK AUTHORITY yang ditambahkan nanti akan
          ditampilkan di halaman ini.
        </p>
      </section>
    </main>
  );
}
