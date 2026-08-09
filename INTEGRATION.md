# Integrasi Vortex1 dan Digie Store

## Arsitektur

```text
Telegram Owner
      │
      ▼
Vortex1 di Pterodactyl
      │ HTTPS + BOT_API_SECRET
      ▼
Next.js API di Vercel
      │ GitHub Contents API
      ▼
Repository Digie Store
  ├─ src/data/products.json
  ├─ src/data/testimonials.json
  ├─ src/data/orders.json
  ├─ storage/products/*
  └─ storage/testimonials/*
```

Bot tidak menyimpan produk dan testimoni pada RAM atau disk panel. Bot hanya mengirim perubahan ke API website. Vercel menyimpan data dan gambar ke repository sehingga data tetap tersedia saat bot atau Pterodactyl mati/restart.

## Environment Variables Vercel

Tambahkan seluruh variable berikut pada Project Settings > Environment Variables, lalu lakukan Redeploy:

- `ORDER_SESSION_SECRET`: minimal 32 karakter acak.
- `BOT_API_SECRET`: minimal 24 karakter dan harus sama dengan bot.
- `GITHUB_TOKEN`: fine-grained PAT dengan akses Contents Read and write.
- `GITHUB_OWNER`: `digiestore`.
- `GITHUB_REPO`: `Digiestore`.
- `GITHUB_BRANCH`: `main`.
- `PRODUCTS_FILE`: `src/data/products.json`.
- `TESTIMONIALS_FILE`: `src/data/testimonials.json`.
- `ORDERS_FILE`: `src/data/orders.json`.

## Environment Variables Pterodactyl

Salin `.env.example` bot menjadi `.env`, lalu isi:

```env
BOT_TOKEN=TOKEN_BOT_YANG_SAMA
OWNER_ID=ID_OWNER
WEBSITE_URL=https://digiestore.vercel.app
BOT_API_SECRET=SECRET_YANG_SAMA_DENGAN_VERCEL
```

## Pemeriksaan Integrasi

Menu `ʙᴏᴛ ꜱᴇᴛᴛɪɴɢ` memanggil `GET /api/bot/health` dan menampilkan status repository, branch, jumlah produk, serta jumlah testimoni secara real-time.

## Alur Produk

1. Owner menekan `+ ᴘʀᴏᴅᴜᴋ`.
2. Bot meminta nama, kategori, stok, deskripsi singkat, harga, gambar, dan deskripsi lengkap.
3. Gambar dan data dikirim ke API Vercel.
4. Vercel menyimpan data ke GitHub.
5. Website membaca data terbaru secara dinamis tanpa menunggu bot tetap online.

## Alur Testimoni

Bot meminta foto, nama, Telegram, WhatsApp, produk, harga, jumlah, pembayaran, total, dan tanggal. Data langsung tampil pada halaman Testimoni setelah penyimpanan berhasil.

## Alur Order

1. Pelanggan menekan `Beli` pada website.
2. Website menyimpan order langsung ke GitHub.
3. Admin membaca dan memproses order melalui WebTools.
4. WebTools memperbarui status menjadi `completed` atau `cancelled`.
5. Halaman notifikasi pelanggan membaca status terbaru dari penyimpanan GitHub.

## Batas Upload

Gambar produk/testimoni mendukung JPG, PNG, atau WEBP maksimal 4 MB. Untuk mempertahankan kualitas dan ukuran asli, kirim gambar sebagai file/document Telegram, bukan sebagai foto terkompresi.
