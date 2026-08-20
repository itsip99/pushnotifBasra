# Migrasi Go — HRIS, Wellness, LSA

Migrasi bertahap dari Node (`src/`) ke Go, scope awal: modul HRIS, JavaWellness, LSA,
plus cron `checkpushnotif`. Modul lain (JavaYoga, BasraMobile, FixupMoto, SPKBasra,
Instagram) TETAP di Node untuk sekarang — RabbitMQ dipakai bersama, jadi worker Go
dan worker Node bisa jalan berdampingan selama migrasi (nama queue dibuat identik).

## Build

Butuh Go 1.22+ ter-install di mesin build (belum ada di sandbox ini, jadi kode ini
**belum pernah di-`go build` / di-compile-test** — wajib diverifikasi dulu sebelum
dipakai produksi).

```bash
cd go
go mod tidy     # download dependency (amqp091-go, oauth2) & generate go.sum
go build ./...  # compile semua binary, cek error kompilasi
```

Kalau `go mod tidy` gagal karena tidak ada akses internet dari server, jalankan itu
di mesin dev yang ada internet dulu, lalu commit `go.sum` yang dihasilkan.

## Menjalankan

Masing-masing `cmd/*` adalah binary terpisah (1 API + 3 worker + 1 cron):

```bash
go run ./cmd/api               # HTTP server: /hris/*, /lsa/*, /health
go run ./cmd/worker-hris        # worker HRIS (queue: push_jobs)
go run ./cmd/worker-wellness    # worker Wellness (queue: push_jobs_javawellness)
go run ./cmd/worker-lsa         # worker LSA (queue: push_jobs_lsa)
go run ./cmd/cron-checkpushnotif
```

Build binary untuk deploy:
```bash
go build -o bin/api.exe ./cmd/api
go build -o bin/worker-hris.exe ./cmd/worker-hris
go build -o bin/worker-wellness.exe ./cmd/worker-wellness
go build -o bin/worker-lsa.exe ./cmd/worker-lsa
go build -o bin/cron-checkpushnotif.exe ./cmd/cron-checkpushnotif
```

## Environment variables

| Var | Default | Keterangan |
|---|---|---|
| `RABBIT_URL` | `amqp://admin:suryatimur@localhost` | sama seperti versi Node |
| `PORT_GO` | `5001` | port API Go — **beda dari API Node** (biasanya 5000) supaya bisa jalan bersamaan selama migrasi |
| `HRIS_FIREBASE_CREDENTIAL` | `credentials/hris-mobile-flutter-bba9799773f1.json` | path file service account HRIS |
| `WELLNESS_FIREBASE_CREDENTIAL` | `credentials/javawellness-3c6ad-firebase-adminsdk-fbsvc-e32ce697c8.json` | path file service account Wellness |
| `LSA_FIREBASE_CREDENTIAL` | `credentials/lsamobile-firebase-adminsdk-fbsvc-ada2a5477d.json` | path file service account LSA |

File kredensial di `go/credentials/` sudah dicopy dari `src/services/*/`.

## Kompatibilitas dengan Node

- Nama queue RabbitMQ identik (`push_jobs`, `push_jobs_javawellness`, `push_jobs_lsa`,
  `push_jobs_yamaha`) — worker Go & Node bisa saling kirim/terima job tanpa masalah.
- `worker-hris` (Go) tetap push callback ke `push_jobs_yamaha` dengan format job yang
  sama persis, supaya `worker-yamaha` (masih Node, belum dimigrasi) tetap bisa proses.
- Endpoint HTTP & format response JSON dibuat sama persis dengan versi Node
  (`/HRIS/modify`, `/HRIS/log-error`, `/LSA/modify`, `/WELLNESS/modify`) supaya client
  (app Flutter/backend eksternal) tidak perlu berubah. Path pakai huruf besar --
  `net/http.ServeMux` di Go itu case-sensitive (beda dari Express Node yang defaultnya
  case-insensitive), jadi path harus persis sama.
- Modul HRIS & LSA sudah tanpa DB (sesuai perubahan yang sudah dilakukan di sisi Node) —
  device token dikirim langsung oleh caller, tidak disimpan di sini.
- Modul Wellness sebelumnya cuma punya worker (job dikirim manual ke queue oleh caller
  eksternal) -- sekarang sudah ada endpoint HTTP-nya juga (`internal/wellness/handler.go`),
  sama pola-nya dengan LSA.

## Yang BELUM dikerjakan / perlu ditinjau

- Belum ada `go.sum` (butuh `go mod tidy` dengan akses internet).
- Belum pernah di-compile — cek error kompilasi dulu sebelum deploy.
- Belum ada Dockerfile Go / integrasi ke `docker-compose.yml` yang sudah ada (yang itu
  masih untuk versi Node) — beri tahu kalau mau dibuatkan sekalian.
- Belum ada test otomatis.
- Rotasi log harian custom (bukan winston-daily-rotate-file) — file lama TIDAK
  otomatis terhapus, perlu logrotate/cron terpisah kalau retensi 14 hari mau dijaga.
- Cron `checkpushnotif` pakai polling loop 30 detik (bukan library cron sungguhan) —
  cukup akurat untuk kebutuhan "jalan 1x per hari jam 08:00", tapi kalau precision
  lebih penting, pertimbangkan pakai library seperti `robfig/cron`.
