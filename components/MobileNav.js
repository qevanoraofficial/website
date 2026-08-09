import Link from "next/link";

const items = [
  {
    key: "home",
    href: "/",
    label: "ʙᴇʀᴀɴᴅᴀ",
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5 10.8V20h5v-5h4v5h5v-9.2" />
      </svg>
    )
  },
  {
    key: "testimoni",
    href: "/testimoni",
    label: "ᴛᴇꜱᴛɪᴍᴏɴɪ",
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M6 3h9l3 3v15H6z" />
        <path d="M14 3v4h4M9 11h6M9 15h6" />
      </svg>
    )
  },
  {
    key: "produk",
    href: "/produk",
    label: "ᴘʀᴏᴅᴜᴋ",
    icon: (
      <svg aria-hidden="true" fill="currentColor" viewBox="0 -960 960 960">
        <path d="M240-80q-33 0-56.5-23.5T160-160v-480q0-33 23.5-56.5T240-720h80q0-66 47-113t113-47q66 0 113 47t47 113h80q33 0 56.5 23.5T800-640v480q0 33-23.5 56.5T720-80H240Zm0-80h480v-480h-80v80q0 17-11.5 28.5T600-520q-17 0-28.5-11.5T560-560v-80H400v80q0 17-11.5 28.5T360-520q-17 0-28.5-11.5T320-560v-80h-80v480Zm160-560h160q0-33-23.5-56.5T480-800q-33 0-56.5 23.5T400-720ZM240-160v-480 480Z" />
      </svg>
    )
  },
  {
    key: "notifikasi",
    href: "/notifikasi",
    label: "ɴᴏᴛɪꜰɪᴋᴀꜱɪ",
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </svg>
    )
  },
  {
    key: "akun",
    href: "/akun",
    label: "ᴀᴋᴜɴ",
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c.8-4.2 3.5-6 8-6s7.2 1.8 8 6" />
      </svg>
    )
  }
];

export default function MobileNav({ active }) {
  return (
    <nav aria-label="Navigasi utama" className="mobile-bottom-nav">
      {items.map((item) => (
        <Link
          className={`bottom-nav-item${active === item.key ? " active" : ""}`}
          data-nav={item.key}
          href={item.href}
          key={item.key}
        >
          {item.icon}
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
