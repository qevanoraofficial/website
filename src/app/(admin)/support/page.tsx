import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support | QEVANORA OFFICIAL",
  description: "Kontak bantuan resmi QEVANORA OFFICIAL.",
};

const contacts = [
  {
    name: "WhatsApp",
    value: "087761057674",
    href: "https://wa.me/6287761057674",
    icon: (
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path d="M12.04 2C6.52 2 2.04 6.48 2.04 12c0 1.76.46 3.48 1.33 4.99L2 22l5.16-1.35A9.93 9.93 0 0 0 12.04 22C17.56 22 22 17.52 22 12S17.56 2 12.04 2Zm0 18.18a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.06.8.82-2.98-.2-.31A8.17 8.17 0 1 1 12.04 20.18Zm4.48-6.12c-.24-.12-1.45-.72-1.68-.8-.22-.08-.39-.12-.55.12-.16.24-.63.8-.78.96-.14.16-.28.18-.52.06-.24-.12-1.03-.38-1.95-1.2-.72-.64-1.2-1.43-1.34-1.67-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.32-.75-1.81-.2-.48-.4-.41-.55-.42h-.47c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.31.98 2.47c.12.16 1.7 2.6 4.12 3.65.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.45-.59 1.65-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28Z" />
      </svg>
    ),
  },
  {
    name: "Telegram",
    value: "@digistore205",
    href: "https://t.me/digistore205",
    icon: (
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path d="M21.9 4.1 18.9 19c-.22 1.05-.82 1.31-1.66.82l-4.57-3.37-2.2 2.12c-.25.25-.45.45-.92.45l.33-4.66 8.49-7.67c.37-.33-.08-.52-.57-.19L7.3 13.11l-4.52-1.41c-.98-.31-1-.98.2-1.45L20.66 3.43c.82-.3 1.54.2 1.24.67Z" />
      </svg>
    ),
  },
  {
    name: "YouTube",
    value: "@DigieStore",
    href: "https://www.youtube.com/@DigieStore",
    icon: (
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path d="M23.5 6.2a3 3 0 0 0-2.11-2.12C19.52 3.58 12 3.58 12 3.58s-7.52 0-9.39.5A3 3 0 0 0 .5 6.2C0 8.07 0 12 0 12s0 3.93.5 5.8a3 3 0 0 0 2.11 2.12c1.87.5 9.39.5 9.39.5s7.52 0 9.39-.5a3 3 0 0 0 2.11-2.12C24 15.93 24 12 24 12s0-3.93-.5-5.8ZM9.6 15.6V8.4L15.84 12 9.6 15.6Z" />
      </svg>
    ),
  },
];

export default function SupportPage() {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
      <div className="text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-500/10 dark:text-brand-400">
          <svg
            width="34"
            height="34"
            viewBox="0 -960 960 960"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path d="M480-80q-50 0-85-35t-35-85H240q-33 0-56.5-23.5T160-280v-400q0-83 58.5-141.5T360-880h240q83 0 141.5 58.5T800-680v400q0 33-23.5 56.5T720-200H600q0 50-35 85t-85 35Zm-80-120q0 33 23.5 56.5T480-120q33 0 56.5-23.5T560-200H400Zm-160-80h480v-400q0-50-35-85t-85-35H360q-50 0-85 35t-35 85v400Zm120-80q-33 0-56.5-23.5T280-440v-80q0-33 23.5-56.5T360-600h40v240h-40Zm240 0h-40v-240h40q33 0 56.5 23.5T680-520v80q0 33-23.5 56.5T600-360ZM240-280v-400 400Z" />
          </svg>
        </span>

        <h1 className="mt-5 text-xl font-semibold text-gray-800 dark:text-white/90 sm:text-2xl">
          Pusat Bantuan
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500 dark:text-gray-400">
          Hubungi QEVANORA OFFICIAL melalui kontak resmi berikut.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4">
        {contacts.map((contact) => (
          <a
            key={contact.name}
            href={contact.href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-4 rounded-xl border border-gray-200 p-4 transition hover:border-brand-300 hover:bg-brand-50/50 dark:border-gray-800 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/5"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-500/10 dark:text-brand-400">
              {contact.icon}
            </span>

            <span className="min-w-0 flex-1 text-left">
              <span className="block text-sm text-gray-500 dark:text-gray-400">
                {contact.name}
              </span>
              <span className="mt-1 block truncate text-base font-semibold text-gray-800 dark:text-white/90">
                {contact.value}
              </span>
            </span>

            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="shrink-0 text-gray-400"
              aria-hidden="true"
            >
              <path
                d="M9 18 15 12 9 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        ))}
      </div>
    </section>
  );
}
