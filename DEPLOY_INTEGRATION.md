# Deploy Integrasi Vortex1 + Digie Store

## Urutan wajib

1. Deploy **website** ke GitHub/Vercel.
2. Isi seluruh Environment Variables Vercel.
3. Redeploy website sampai route health aktif.
4. Upload dan jalankan **bot Vortex1** di Pterodactyl.
5. Buka `/start` lalu tekan `ʙᴏᴛ ꜱᴇᴛᴛɪɴɢ` untuk verifikasi koneksi.

---

## 1. Deploy website ke GitHub

Extract `Digiestore_Website_Integrated_v2.4.0.zip` langsung ke root repository, sehingga `package.json` tetap berada di root.

Contoh melalui Termux:

```bash
cd ~/Digiestore
unzip -o /sdcard/Download/Digiestore_Website_Integrated_v2.4.0.zip -d .
rm -rf node_modules .next
git add -A
git commit -m "Integrate Vortex1 bot with Digie Store API"
git push origin main
```

Jangan push file `.env`, `.env.local`, token Telegram, GitHub token, atau API secret.

---

## 2. Buat secret

Jalankan dua kali. Gunakan hasil pertama untuk `ORDER_SESSION_SECRET` dan hasil kedua untuk `BOT_API_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`BOT_API_SECRET` pada Vercel dan bot harus **sama persis**.

---

## 3. Environment Variables Vercel

Buka **Vercel → Project Digie Store → Settings → Environment Variables** dan tambahkan:

```env
ORDER_SESSION_SECRET=SECRET_ACAK_MINIMAL_32_KARAKTER
BOT_API_SECRET=SECRET_ACAK_YANG_SAMA_DENGAN_BOT
GITHUB_TOKEN=FINE_GRAINED_GITHUB_PAT
GITHUB_OWNER=digiestore
GITHUB_REPO=Digiestore
GITHUB_BRANCH=main
PRODUCTS_FILE=src/data/products.json
TESTIMONIALS_FILE=src/data/testimonials.json
ORDERS_FILE=src/data/orders.json
```

GitHub fine-grained PAT wajib memilih repository `Digiestore` dan memberikan permission:

```text
Repository permissions → Contents → Read and write
```

Setelah semua variable disimpan, lakukan **Redeploy** pada deployment production.

### Uji website

Endpoint publik:

```bash
curl -sS "https://digiestore.vercel.app/api/catalog?type=products"
```

Endpoint integrasi rahasia:

```bash
curl -sS \
  -H "Authorization: Bearer ISI_BOT_API_SECRET" \
  "https://digiestore.vercel.app/api/bot/health"
```

Respons benar memiliki `"ok":true`, nama repository, branch, jumlah produk, dan jumlah testimoni.

---

## 4. Deploy Vortex1 ke Pterodactyl

Upload `Vortex1_Bot_Integrated_v1.1.0.zip` ke `/home/container`, lalu extract langsung di sana.

Buat `.env` dari `.env.example`:

```env
BOT_TOKEN=TOKEN_BOT_YANG_SAMA_DENGAN_VERCEL
OWNER_ID=ID_NUMERIK_OWNER
OWNER_USERNAME=digistore205
BOT_AUTHOR=Digie Store
BOT_NAME=Vortex1
BOT_VERSION=1.1.0
WEBSITE_URL=https://digiestore.vercel.app
BOT_API_SECRET=SECRET_YANG_SAMA_DENGAN_VERCEL
REQUEST_TIMEOUT_MS=20000
MAX_IMAGE_BYTES=4194304
DELETE_COMMANDS=true
TZ=Asia/Jakarta
LOG_LEVEL=info
```

Startup command Pterodactyl:

```bash
npm run ptero:start
```

Setelah dependency terpasang, startup yang lebih cepat:

```bash
npm start
```

---

## 5. Pengujian akhir

1. Kirim `/start` ke Vortex1.
2. Tekan `ʙᴏᴛ ꜱᴇᴛᴛɪɴɢ` dan pastikan status integrasi `✅ aktif`.
3. Tambah satu produk menggunakan `+ ᴘʀᴏᴅᴜᴋ`.
4. Reload website dan pastikan kategori serta produk tampil.
5. Tambah testimoni dan pastikan nomor dimulai dari `01`.
6. Tekan `Beli` dari detail produk.
7. Pastikan owner menerima pesan order dengan tombol `SUKSES` dan `BATAL`.
8. Tekan salah satu tombol dan pastikan halaman notifikasi pelanggan berubah otomatis.

---

## Penyimpanan

```text
Vortex1 / Pterodactyl
        │ HTTPS + Bearer BOT_API_SECRET
        ▼
Next.js API / Vercel
        │ GitHub Contents API
        ▼
Digiestore repository
├── src/data/products.json
├── src/data/testimonials.json
├── src/data/orders.json
├── storage/products/*
└── storage/testimonials/*
```

Produk, testimoni, gambar, stok, dan status order tidak disimpan sebagai database lokal bot. Data tetap tersedia saat bot atau Pterodactyl restart/offline.
