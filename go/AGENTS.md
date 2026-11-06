# AGENTS.md — HRIS Push Notification (Go)

Layanan push notification Go (migrasi dari Node/TypeScript). Mengirim notifikasi FCM v1 untuk beberapa app (HRIS, LSA, Wellness, BasraMobile, FixupMoto, JavaYoga, Instagram) via HTTP API dan RabbitMQ worker. Instruksi langsung dari pengguna mengesampingkan semuanya.

Kerjakan hanya yang diminta, pertahankan perubahan lokal pengguna, dan laporkan verifikasi secara jujur.

## Arsitektur

```
cmd/                         ← binary entry-point (1 API + worker per modul + cron)
  api/main.go                ← HTTP server, mount semua handler
  worker-hris/main.go        ← consumer RabbitMQ queue push_jobs
  worker-wellness/main.go    ← consumer queue push_jobs_javawellness
  worker-lsa/main.go         ← consumer queue push_jobs_lsa
  worker-javayoga/main.go    ← consumer queue push_jobs_javayoga
  worker-fixupmoto/main.go   ← consumer queue push_jobs_fixupmoto
  cron-checkpushnotif/main.go

internal/                    ← domain package, masing-masing satu folder
  hris/                      ← handler.go (HTTP), worker.go (consumer), types.go, groupkey.go
  lsa/                       ← handler.go, fcm.go, worker.go
  wellness/                  ← handler.go, worker.go
  javayoga/                  ← handler.go, fcm.go, worker.go
  basramobile/               ← handler.go
  fixupmoto/                 ← handler.go, worker.go
  instagram/                 ← handler.go, cron.go, tokenstore.go
  fcmauth/fcmauth.go         ← OAuth2 token provider untuk Firebase service account
  rabbitmq/rabbitmq.go        ← AMQP channel singleton + auto-reconnect
  logger/logger.go            ← file logger rotate harian, timezone WIB

credentials/                 ← service account JSON (JANGAN commit / log isi)
```

## Pola utama

| Konsep | Pola di repo ini |
|---|---|
| Handler HTTP | Struct `Handler` + `NewHandler()` constructor + `RegisterRoutes(mux)`. Method pada receiver `*Handler`. |
| Worker RabbitMQ | Struct `Worker` + `NewWorker()` + `Run()` (blocking consume loop). Prefetch 20, retry via delay queue, TTL-aware. |
| FCM call | `sendNotificationFcm()` — POST ke FCM v1 via `http.Client` dengan timeout 15s. Token dari `fcmauth.TokenProvider`. |
| Retry | Max 3, delay eksponensial (5s/15s/30s) via dead-letter delay queue. Job expired di-drop. Token invalid (404/UNREGISTERED) tidak di-retry. |
| Logging | `logger.New("nama")` → file `logs/nama-info-YYYY-MM-DD.log` dan `logs/nama-error-YYYY-MM-DD.log`. Buffered write, flush tiap 500ms. |
| Config | Environment variable (`RABBIT_URL`, `PORT_GO`, `*_FIREBASE_CREDENTIAL`). Tidak ada file `.env` loader — set langsung di OS/docker. |
| Kompatibilitas Node | Nama queue, format JSON job, endpoint path, dan response body HARUS identik dengan versi Node (`src/`). Worker Go dan Node bisa jalan berdampingan. |

## Helper yang sudah ada

| Kebutuhan | Pakai |
|---|---|
| AMQP channel singleton | `rabbitmq.GetChannel()` — `internal/rabbitmq/rabbitmq.go` |
| OAuth2 token FCM | `fcmauth.NewTokenProvider(credFile)` → `.AccessToken(ctx)` / `.ForceRefresh(ctx)` — `internal/fcmauth/fcmauth.go` |
| Logger (file + stdout) | `logger.New("prefix")` → `.Info(format, args...)` / `.Error(format, args...)` — `internal/logger/logger.go` |
| Ambil string dari `map[string]interface{}` | `metaString(meta, key)` — `internal/hris/types.go` (saat ini private ke package hris, copy pola jika butuh di package lain) |
| Mask token untuk log | `maskToken(token)` — `internal/hris/handler.go` |
| Write JSON response | `writeJSON(w, status, body)` — tiap package punya salinan lokal |
| Env var dengan fallback | `getenv(key, fallback)` — `cmd/api/main.go` |
| Queue constants | `rabbitmq.QUEUE`, `rabbitmq.YAMAHA_QUEUE`, dll — `internal/rabbitmq/rabbitmq.go` |

## Aturan wajib

1. **Baca dulu** handler, worker, dan types di package yang disentuh sebelum mengedit. Ikuti pola package tersebut.
2. **Kompatibilitas Node adalah prioritas.** Nama queue RabbitMQ, format JSON job, path HTTP, dan response body harus tetap identik dengan versi Node di `src/`. Jangan ubah tanpa konfirmasi — client Flutter dan backend eksternal bergantung pada format ini.
3. **Path HTTP case-sensitive.** `net/http.ServeMux` Go case-sensitive (beda dari Express). Path harus persis: `/HRIS/modify`, `/LSA/modify`, `/WELLNESS/modify`, `/BASRAMOBILE/modify`, `/FIXUPMOTO/modify`, `/JAVAYOGA/modify`, `/instagram/*`.
4. **Jangan commit/log credential.** File di `credentials/` dan token OAuth TIDAK boleh masuk log, kode, test, atau commit. Mask token sebelum logging (`maskToken()`).
5. **Jangan rename atau restruktur di luar scope.** Nama package, file, dan queue sudah mapan. Jangan refactor massal.
6. **Jangan edit file di `src/` (Node).** Repo ini punya dua codebase berdampingan. Scope AGENTS.md ini hanya `go/`.
7. **Error handling: early return.** Ikuti pola Go: `if err != nil { ... return }`. Jangan panic kecuali saat startup gagal fatal (`log.Fatalf`).
8. **Timeout eksplisit.** HTTP client dan server harus punya timeout. Jangan pakai `http.DefaultClient` atau `http.ListenAndServe` tanpa timeout.
9. **`http.Transport` reuse.** Satu `fcmTransport` per package, bukan per request. Buat `MaxIdleConnsPerHost` cukup untuk prefetch worker.

## Alur kerja

1. Identifikasi package mana yang disentuh (`internal/<modul>/`) dan binary mana yang terpengaruh (`cmd/<binary>/`).
2. Baca semua file `.go` di package tersebut — satu package Go saling akses tanpa import.
3. Jika modul punya pasangan di Node (`src/controller/`, `src/worker.*.ts`), baca versi Node untuk memastikan kontrak sama.
4. Implementasikan. Tangani error di setiap langkah (token, publish, FCM call). Jangan biarkan goroutine leak — pastikan channel/connection di-close di jalur error.
5. Tinjau `git diff`: hanya perubahan yang diminta, tanpa dead code atau log data sensitif.

## Verifikasi

| Perubahan | Perintah |
|---|---|
| Kompilasi | `cd go && go build ./...` |
| Vet | `cd go && go vet ./...` |
| Format | `cd go && gofmt -l .` (harus kosong) |
| Test | `cd go && go test ./...` (belum ada test; tambahkan jika mengubah logic) |
| Dependency | `cd go && go mod tidy` (jika menambah import baru) |

- Build belum pernah dijalankan di sandbox ini (butuh Go 1.22+ dan akses jaringan untuk dependency). Jika tidak bisa build, laporkan perintah dan alasannya agar dijalankan manual.
- Belum ada test otomatis di repo ini. Jika menambah logic baru yang kompleks, buatkan test. Jika tidak bisa, sebutkan bahwa test belum ada.

## Laporan akhir

Sebutkan:

1. File yang diubah dan ringkasan perubahannya.
2. Perintah verifikasi yang dijalankan beserta hasilnya (lulus/gagal/tidak dijalankan + alasan).
3. Dampak terhadap kompatibilitas Node (apakah format queue/endpoint/response berubah).
4. Batasan atau risiko yang tersisa.

Jangan mengklaim build/test lulus jika tidak dijalankan.
