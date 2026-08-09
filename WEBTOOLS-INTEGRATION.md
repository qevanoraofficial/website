# Digie Store API untuk WebTools Admin

Digie Store menyediakan API server-side untuk pengelolaan produk, stok,
testimoni, dan order tanpa Telegram Bot:

- `GET /api/bot/products`
- `POST /api/bot/products`
- `PATCH /api/bot/products`
- `DELETE /api/bot/products?id=...`
- `GET /api/bot/testimonials`
- `POST /api/bot/testimonials`
- `DELETE /api/bot/testimonials?id=...`
- `GET /api/bot/orders`
- `POST /api/bot/orders` untuk mengubah status order menjadi `completed` atau `cancelled`

Semua endpoint dilindungi Bearer token. Atur `WEBTOOLS_API_SECRET` di Vercel
Digie Store dan gunakan nilai yang sama sebagai `DIGIE_STORE_API_SECRET` di
Vercel WebTools.

Checkout website menyimpan order langsung ke `src/data/orders.json` melalui
GitHub Contents API. Nama pelanggan, WhatsApp, dan Telegram opsional disimpan
bersama order agar dapat dikelola dari WebTools. Pastikan repository bersifat
private karena file order berisi informasi kontak pelanggan.

Environment Variables Digie Store yang diperlukan:

- `ORDER_SESSION_SECRET`
- `WEBTOOLS_API_SECRET`
- `GITHUB_TOKEN`
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_BRANCH`
- `PRODUCTS_FILE`
- `TESTIMONIALS_FILE`
- `ORDERS_FILE`

`TELEGRAM_BOT_TOKEN` dan `TELEGRAM_OWNER_ID` tidak digunakan lagi.
