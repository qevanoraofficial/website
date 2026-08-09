import Link from "next/link";

export default function Header({ home = false }) {
  return (
    <header className="nav-wrap">
      <div className="container navbar">
        <Link aria-label="QEVANORA OFFICIAL" className="brand" href="/">
          <div className="brand-logo"><img src="/qevanora-logo.png" alt="" /></div>
          <div className="brand-text">
            <strong>QEVANORA OFFICIAL</strong>
            <span>Premium Digital Store</span>
          </div>
        </Link>

        <nav className="nav-links" id="navLinks">
          <Link href="/">Beranda</Link>
          <Link href="/produk">Produk</Link>
          {home ? (
            <>
              <Link href="/#advantages">Keunggulan</Link>
              <Link href="/testimoni">Review</Link>
              <Link href="/#faq">FAQ</Link>
            </>
          ) : (
            <>
              <Link href="/testimoni">Review</Link>
              <Link href="/notifikasi">Notifikasi</Link>
              <Link href="/akun">Akun</Link>
            </>
          )}
        </nav>

        <div className="nav-actions">
          <Link className="btn btn-secondary" href="/produk">Lihat Produk</Link>
          <Link className="btn btn-primary" href={home ? "/#contact" : "/akun"}>
            {home ? "Belanja Sekarang" : "Akun"}
          </Link>
        </div>
      </div>
    </header>
  );
}
