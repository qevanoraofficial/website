import "./globals.css";

export const metadata = {
  title: {
    default: "QEVANORA OFFICIAL — Modern Digital Store",
    template: "%s"
  },
  description: "QEVANORA OFFICIAL — toko online modern untuk produk digital dan layanan pilihan.",
  icons: {
    icon: "/qevanora-logo.png",
    apple: "/qevanora-logo.png"
  }
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#00152e"
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
