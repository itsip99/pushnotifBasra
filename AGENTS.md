# AGENTS.md — HRIS Push Notification (Node.js)

Layanan push notification Node/TypeScript: Express API + worker RabbitMQ yang mengirim notifikasi FCM v1 untuk beberapa app (HRIS, LSA, Wellness, JavaYoga, FixupMoto, BasraMobile, SPK Basra, Instagram). Instruksi langsung dari pengguna mengesampingkan semuanya.

Scope file ini: `src/`, `dist/`, `ecosystem.config.js`, `package.json`. Untuk kode Go di `go/`, ikuti [go/AGENTS.md](go/AGENTS.md).

Kerjakan hanya yang diminta, pertahankan perubahan lokal pengguna, dan laporkan verifikasi secara jujur.

## Arsitektur

```
src/
  index.ts                     ← Express API (PORT, default 8000; production 5000)
  worker.<app>.ts              ← consumer RabbitMQ, 1 file per app
  config/rabbit.ts             ← channel AMQP singleton + auto-reconnect + nama queue
  config/httpAgent.ts          ← fcmAgent (keep-alive) untuk semua axios ke FCM
  controller/<App>/<app>.ts    ← logic kirim notif (topic sinkron, device token → queue)
  routes/<App>/{index,modify}.ts ← POST /<APP>/modify, switch berdasarkan body.jenis
  services/<app>/
    token_firebase_service_<app>.ts ← JWT dari service account → access token
    <app>Token.ts                   ← cache token 55 menit + clearCachedToken()
    *.json                          ← service account (credential, JANGAN log isinya)
  logger/logger.ts             ← winston, file logs/ rotate harian, timezone Asia/Jakarta
dist/                          ← hasil `npx tsc` (yang dijalankan PM2)
```

| Worker | Queue | PM2 name |
|---|---|---|
| worker.hris.ts | `push_jobs` | hris-worker |
| worker.javayoga.ts | `push_jobs_javayoga` | javayoga-worker |
| worker.javawellness.ts | `push_jobs_javawellness` | wellness-worker |
| worker.lsa.ts | `push_jobs_lsa` | lsa-worker / worker.lsa |
| worker.yamaha.ts | `push_jobs_yamaha` | yamaha-worker |
| worker.fixupmoto.ts | `push_jobs_fixupmoto` | fixupmoto-worker |

## Pola utama

| Konsep | Pola |
|---|---|
| Request API | `POST /<APP>/modify` dengan `{ jenis, to, notif, data }`. `jenis`: `sendingNotifbyTopic` (kirim langsung ke FCM) atau `sendingNotifbyDeviceToken` (masuk queue). |
| Job queue | `{ message: { token, notification, data, android?, apns? } }`, opsional `createdAt`/`ttlMs`. Format ini dipakai juga oleh worker Go — jangan diubah sepihak. |
| Worker | prefetch, ack manual, 401 → `clearCachedToken()` lalu coba sekali lagi, 404/UNREGISTERED → drop, selain itu retry max 3 via header `x-retry`. Template: `worker.javayoga.ts`. |
| Response | Body `meta` (`code`/`status`/`messages`) harus tetap sama — client Flutter bergantung padanya. |
| URL FCM | `https://fcm.googleapis.com/v1/projects/<project_id>/messages:send`. `project_id` HARUS sama dengan credential dan project Firebase app-nya, kalau tidak FCM balas `403 SenderId mismatch`. Lebih aman ambil dari `project_id` di JSON credential (lihat `FIXUPMOTO_FCM_URL`). |

## Aturan wajib

1. **Baca dulu** controller, route, service, dan worker app yang disentuh. Ikuti pola app lain (JavaYoga paling lengkap).
2. **Nama queue, format job, path, dan response body** tidak boleh berubah tanpa konfirmasi. Kalau berubah, versi Go (`go/internal/<app>/`) harus ikut diubah.
3. **Jangan log/commit isi credential** atau access token.
4. **Jangan restruktur atau rename** di luar scope.
5. **`tsc` tidak menyalin file `.json`.** Kalau credential di `src/services/**` diganti, salin juga ke `dist/services/**` (dan `go/credentials/` kalau dipakai Go).

## Menambah worker untuk app baru

1. `src/config/rabbit.ts`: tambah konstanta `<APP>_QUEUE = "push_jobs_<app>"`.
2. `src/services/<app>/<app>Token.ts`: cache token (salin pola `javaToken.ts`).
3. `src/worker.<app>.ts`: salin `worker.javayoga.ts`, ganti queue, token, URL FCM, label log, consumerTag.
4. Controller: `sendNotificationbyDeviceToken` → `ch.sendToQueue(<APP>_QUEUE, ..., { persistent: true })`, respon `"Notification queued successfully"`.
5. `package.json`: script `start:<app>`, tambahkan ke `start:all` / `restart:all` / `stop:all`.
6. `ecosystem.config.js`: entry baru dengan `env: { NODE_ENV: "production", RABBIT_URL: "amqp://admin:suryatimur@localhost" }`.
7. Kalau ada versi Go, tambahkan queue yang sama di `go/internal/rabbitmq/rabbitmq.go`.

## Deploy (server Windows + PM2)

- Server: `C:\Users\Administrator\Documents\ServiceNotif\STSJ`. API yang aktif adalah **hris-api (Node)** di port 5000; go-api dalam keadaan stopped.
- `ecosystem.config.js` memanggil `require('dotenv').config()`. `.env` berisi `RABBIT_URL=...host.docker.internal` (khusus Docker) yang bocor ke semua app PM2. Karena itu **setiap entry Node wajib set `RABBIT_URL` sendiri** — tanpa itu worker crash `ENOTFOUND host.docker.internal`.
- Selalu pakai `pm2 start ecosystem.config.js --only <name>`. Tanpa `--only`, go-api ikut start dan bentrok port 5000 dengan hris-api.
- PM2 menyimpan env lama saat `restart`. Kalau env/config berubah: `pm2 delete <id>` lalu `start` ulang. Cek dengan `pm2 env <id>` (pakai id angka, bukan nama).
- Restart count tinggi di `pm2 list` = crash loop walau status `online`.
- Setelah berhasil: `pm2 save`.
- RabbitMQ dashboard hanya dari server: `http://localhost:15672` (`management.tcp.ip = 127.0.0.1` di `rabbitmq.conf`).

## Verifikasi

| Perubahan | Perintah |
|---|---|
| Kompilasi | `npx tsc` (harus tanpa error) |
| Config PM2 valid | `node -e "require('./ecosystem.config.js')"` |
| Worker jalan | `pm2 logs <name>` → `... worker ready. Queue: <queue>` |
| Kirim notif | `npm run test:fire` (lokal) / `npm run test:fire:prod` |

Belum ada test otomatis. Jangan mengklaim build/test lulus jika tidak dijalankan.

## Laporan akhir

Sebutkan file yang diubah, perintah verifikasi beserta hasilnya, dampak ke format queue/endpoint/response (dan apakah Go perlu ikut diubah), serta langkah deploy yang dibutuhkan di server.
