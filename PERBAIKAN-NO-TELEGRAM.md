# Perbaikan Checkout Tanpa Telegram Bot

Perubahan ini menghapus ketergantungan checkout dan pendaftaran profil terhadap
Telegram Bot.

## Alur baru

1. Pelanggan menyimpan profil menggunakan Nama dan WhatsApp.
2. Telegram bersifat opsional dan hanya menjadi data kontak tambahan.
3. Tombol Beli menyimpan order langsung ke `src/data/orders.json` melalui
   GitHub Contents API.
4. Order baru berstatus `pending`.
5. WebTools membaca `GET /api/bot/orders` dan memperbarui status melalui
   `POST /api/bot/orders`.
6. Halaman Notifikasi pelanggan membaca status terbaru setiap 5 detik.

## Environment Variables yang tidak lagi diperlukan

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_OWNER_ID`

## Environment Variables yang tetap diperlukan

- `ORDER_SESSION_SECRET`
- `WEBTOOLS_API_SECRET`
- `GITHUB_TOKEN`
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_BRANCH`
- `PRODUCTS_FILE`
- `TESTIMONIALS_FILE`
- `ORDERS_FILE`

## Privasi

Order baru menyimpan nama dan informasi kontak pelanggan agar admin dapat
memprosesnya dari WebTools. Repository GitHub harus bersifat private.
