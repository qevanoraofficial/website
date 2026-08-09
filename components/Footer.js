import Link from "next/link";

export default function Footer({ home = false }) {
  return (
    <footer>
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link className="brand" href="/">
              <div className="brand-logo"><img src="/qevanora-logo.png" alt="" /></div>
              <div className="brand-text">
                <strong>QEVANORA OFFICIAL</strong>
                <span>Premium Digital Store</span>
              </div>
            </Link>
            <p>
              Toko online modern untuk produk digital dan layanan pilihan. Dibuat dengan fokus
              pada kecepatan, kejelasan, dan pengalaman pengguna.
            </p>
          </div>

          <div className="footer-col">
            <h4>Navigasi</h4>
            <Link href="/">Beranda</Link>
            <Link href="/produk">Produk</Link>
            <Link href="/testimoni">Testimoni</Link>
            <Link href="/akun">Akun</Link>
          </div>

          <div className="footer-col">
            <h4>Bantuan</h4>
            {home ? (
              <>
                <Link href="/#faq">FAQ</Link>
                <Link href="/#contact">Kontak</Link>
                <a href="#">Syarat &amp; Ketentuan</a>
                <a href="#">Kebijakan Privasi</a>
              </>
            ) : (
              <>
                <Link href="/notifikasi">Notifikasi</Link>
                <Link href="/akun">Akun</Link>
                <Link href="/#faq">FAQ</Link>
              </>
            )}
          </div>

          <div className="footer-col">
            <h4>Social</h4>
            <a href="#">WhatsApp</a>
            <a href="#">Telegram</a>
            <a href="#">Instagram</a>
            <a href="#">TikTok</a>
          </div>
        </div>

        <div className="copyright">
          <span>© <span id="year"></span> QEVANORA OFFICIAL. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
