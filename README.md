# Digie Store

Website Next.js 16 yang terintegrasi dengan bot Telegram Vortex1 untuk mengelola produk, testimoni, stok, dan status order.

## Runtime

- Node.js 20 atau 22
- Next.js 16.1.6
- React 19.2.0
- TypeScript 5.9.3
- Vercel
- GitHub Contents API sebagai penyimpanan persisten

## Instalasi Lokal

```bash
cp .env.example .env.local
npm ci
npm run check
npm run lint
npm run build
npm run dev
```

Buka `http://localhost:3000`.

## API Integrasi Bot

Semua endpoint berikut membutuhkan header:

```text
Authorization: Bearer BOT_API_SECRET
```

- `GET /api/bot/health`
- `GET/POST/PATCH/DELETE /api/bot/products`
- `GET/POST/DELETE /api/bot/testimonials`
- `POST /api/bot/orders`

Endpoint publik:

- `GET /api/catalog`
- `GET /api/media?path=...`
- `GET/POST /api/orders`

Konfigurasi lengkap tersedia di `INTEGRATION.md`.

## Deploy Vercel

1. Push seluruh isi proyek ke repository GitHub yang terhubung ke Vercel.
2. Tambahkan environment variables dari `.env.example`.
3. Pastikan GitHub token memiliki permission `Contents: Read and write` untuk repository ini.
4. Redeploy Vercel.

Jangan commit `.env`, `.env.local`, token Telegram, token GitHub, atau API secret.
