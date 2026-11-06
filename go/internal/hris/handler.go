// Package hris: HTTP handler setara src/controller/HIRS/hirs.ts + routes/HIRS/modify.ts
//
// CATATAN UNTUK YANG BARU DARI TS/JS:
//   - "package hris" itu sekelas 1 folder module di Node. Semua file .go
//     di folder ini (handler.go, worker.go, types.go, groupkey.go) satu
//     package yang sama -- boleh saling panggil fungsi tanpa import,
//     asal namanya sama-sama ada di package "hris".
//   - Nama yang diawali huruf BESAR (Handler, NewHandler, RegisterRoutes)
//     = "exported", bisa dipakai package lain (setara `export` di TS).
//     Nama diawali huruf kecil (writeJSON, maskToken) = private ke package
//     ini saja (setara tidak di-export).
package hris

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"

	"hris-notif-go/internal/fcmauth"
	"hris-notif-go/internal/logger"
	"hris-notif-go/internal/rabbitmq"
)

const (
	fcmURL      = "https://fcm.googleapis.com/v1/projects/hris-mobile-flutter/messages:send"
	httpTimeout = 15 * time.Second
)

// fcmTransport dipakai bersama oleh semua request ke FCM lewat client ini.
// Default Go http.Transport cuma buka 2 idle connection per host -- terlalu
// sedikit untuk worker yang prefetch 20 pesan sekaligus (bisa banyak request
// paralel ke fcm.googleapis.com). Dengan MaxIdleConnsPerHost dinaikkan,
// koneksi TCP+TLS yang sudah dibuka bisa dipakai ulang lebih banyak request
// paralel tanpa handshake baru tiap kali -- lihat go/README.md soal ini.
var fcmTransport = &http.Transport{
	MaxIdleConns:        100,
	MaxIdleConnsPerHost: 50,
	IdleConnTimeout:     90 * time.Second,
}

// Handler adalah "class" versi Go: struct = kumpulan field (data),
// method-nya didefinisikan TERPISAH di bawah pakai syntax
// `func (h *Handler) namaMethod(...)`. Field h.tokens/h.log/h.client
// setara `this.tokens` dkk di class TS.
type Handler struct {
	tokens *fcmauth.TokenProvider // *T = pointer, "reference" ke TokenProvider (bukan copy)
	log    *logger.Logger
	client *http.Client
}

// NewHandler ini "constructor" -- di Go tidak ada keyword constructor,
// cuma konvensi penamaan: fungsi "NewXxx" yang bikin & return struct-nya.
// `&Handler{...}` = bikin instance struct lalu ambil pointer-nya (setara `new Handler(...)`).
func NewHandler(tokens *fcmauth.TokenProvider, log *logger.Logger) *Handler {
	return &Handler{tokens: tokens, log: log, client: &http.Client{Timeout: httpTimeout, Transport: fcmTransport}}
}

// RegisterRoutes mount /hris/modify dan /hris/log-error, setara routes/HIRS/modify.ts
//
// `func (h *Handler) RegisterRoutes(...)` -- bagian `(h *Handler)` di depan nama
// fungsi itu "receiver". Artinya method ini nempel ke struct Handler, dan `h`
// di dalam body fungsi = `this` di TS/JS. Dipanggilnya: `handler.RegisterRoutes(mux)`.
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	// h.modify tanpa tanda kurung = passing REFERENSI method-nya (kayak `this.modify`
	// dioper sebagai callback di JS), bukan MEMANGGIL method-nya.
	mux.HandleFunc("/HRIS/modify", h.modify)
	mux.HandleFunc("/HRIS/log-error", h.logError)
}

// reqBody setara `interface ReqBody { jenis: string; to?: string; ... }` di TS.
// Bedanya: field WAJIB dideklarasikan semua di depan (Go tidak ada object literal
// bebas bentuk), dan tag `json:"..."` itu yang bilang ke JSON decoder "field Go ini
// mapping ke key JSON apa" (setara nama key biasa di TS karena TS object key = JSON key).
type reqBody struct {
	Jenis               string                 `json:"jenis"`
	To                  string                 `json:"to"`
	Notif               map[string]string      `json:"notif"` // ~ Record<string,string>
	Data                map[string]string      `json:"data"`
	UserID              string                 `json:"userid"`
	Msg                 string                 `json:"msg"`
	MetaData            map[string]interface{} `json:"metaData"` // ~ Record<string, any>
	NotificationKey     string                 `json:"notification_key"`
	NotificationKeyName string                 `json:"notification_key_name"`
	RegistrationIDs     []string               `json:"registration_ids"` // ~ string[]
}

// writeJSON = helper `res.status(status).json(body)` versi Go.
// `interface{}` (atau alias barunya `any`) = TypeScript `any`, bisa nampung apapun.
func writeJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
	// `_ = ...` itu buang return value yang sengaja tidak dipakai. Di Go,
	// SEMUA return value harus "dipakai" atau eksplisit dibuang pakai `_`,
	// kompiler akan error kalau ada variable yang dideklarasikan tapi tak dipakai.
}

// modify = router utama, setara switch-case di routes/HIRS/modify.ts.
// Ini yang didaftarkan sebagai handler HTTP untuk path /hris/modify.
func (h *Handler) modify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"meta": map[string]any{"code": 405, "messages": "method not allowed"}})
		return
	}

	// Parse body JSON request ke struct reqBody.
	// `if err := ...; err != nil {}` ini idiom SANGAT umum di Go: deklarasi
	// variable DAN cek error dalam 1 baris, scope `err` cuma di dalam if-block ini.
	// Setara try/catch di TS, tapi tanpa exception -- error itu VALUE biasa.
	var body reqBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"meta": map[string]any{"code": 400, "messages": "invalid JSON body"}})
		return
	}

	// switch tanpa argumen tambahan kayak Node punya, tapi konsepnya sama
	// persis switch(body.jenis) di TS. Tidak butuh `break` (Go otomatis
	// berhenti setelah 1 case cocok, beda dari JS yang fall-through).
	switch body.Jenis {
	case "sendingNotifbyTopic":
		h.sendNotificationByTopic(r.Context(), w, body)
	case "sendingNotifbyDeviceToken":
		h.sendNotificationByDeviceToken(r.Context(), w, body)
	case "createNotificationGroupToken":
		h.createNotificationKey(r.Context(), w, body)
	case "addUsertoGroup":
		h.groupOp(r.Context(), w, body, "add")
	case "removeUserFromGroup":
		h.groupOp(r.Context(), w, body, "remove")
	default:
		h.log.Error("[HIRS] ROUTE_INVALID_JENIS | jenis=%s", body.Jenis)
		writeJSON(w, http.StatusBadRequest, map[string]any{"meta": map[string]any{"code": 400, "messages": "Invalid jenis value"}})
	}
}

func (h *Handler) logError(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "message": "Received"})
}

func maskToken(token string) string {
	if len(token) < 10 {
		return token
	}
	// String di Go itu byte slice -- token[:6] = substring 0..6 (setara token.slice(0,6)),
	// token[len(token)-4:] = 4 karakter terakhir (setara token.slice(-4)).
	return token[:6] + "..." + token[len(token)-4:]
}

func randHex(n int) string {
	b := make([]byte, n) // `make([]byte, n)` = bikin array/slice kosong panjang n (setara `new Uint8Array(n)`)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// sendNotificationFcm setara sendNotificationFcm() di hirs.ts -- hit FCM v1 API langsung.
//
// Perhatikan signature return: `(int, []byte, error)` -- Go BISA return banyak
// value sekaligus (bukan cuma 1 value/Promise kayak TS). Konvensinya: error
// selalu di posisi TERAKHIR. Caller wajib tampung semua: `status, body, err := ...`.
func (h *Handler) sendNotificationFcm(ctx context.Context, payload map[string]any, accessToken string) (int, []byte, error) {
	buf, _ := json.Marshal(payload) // setara JSON.stringify(payload); error dibuang krn payload pasti valid
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fcmURL, bytes.NewReader(buf))
	if err != nil {
		return 0, nil, err // return awal (early return) kalau gagal bikin request
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := h.client.Do(req) // ini yang benar-benar fire HTTP request (setara `await axios.post(...)`)
	if err != nil {
		return 0, nil, err
	}
	// `defer` = jalankan baris ini PALING TERAKHIR sebelum fungsi selesai,
	// APAPUN jalur keluarnya (return normal atau lewat error di bawah).
	// Setara `finally { resp.body.close() }` tapi lokasinya ditulis di awal.
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body) // setara `await resp.text()` / `await resp.json()` mentah (masih []byte)
	return resp.StatusCode, respBody, nil
}

// fcmErrorMessage parse body error FCM `{"error":{"message":"..."}}` ambil message-nya saja.
func fcmErrorMessage(body []byte) string {
	// struct anonim (didefinisikan langsung di sini, tanpa nama, cuma dipakai
	// sekali) -- setara bikin type inline `{ error: { message: string } }` di TS.
	var parsed struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &parsed); err == nil && parsed.Error.Message != "" {
		return parsed.Error.Message
	}
	return string(body)
}

// sendNotificationByTopic setara sendNotificationbyTopic() di hirs.ts.
// Alur: validasi input -> ambil access token -> POST ke FCM -> balas response.
// Karena Go tidak ada try/catch, tiap langkah yang "bisa gagal" dicek manual
// pakai `if err != nil { ...; return }` -- ini yang disebut pola "early return".
func (h *Handler) sendNotificationByTopic(ctx context.Context, w http.ResponseWriter, body reqBody) {
	h.log.Info("[HIRS] TOPIC_REQUEST_IN | userid=%s | topic=%s | title=%s", orDash(body.UserID), orDash(body.To), orDash(body.Notif["title"]))
	// h.log.Info pakai format string ala printf: %s = string, %d = angka, %v = "apapun".
	// Setara template literal `logger.info(\`... userid=${x} ...\`)` tapi lebih mirip
	// console.log gaya C. Args-nya dioper terpisah, BUKAN di-interpolate manual.

	if strings.TrimSpace(body.To) == "" || len(body.Notif) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"meta": map[string]any{"statusCode": 400, "messages": "to/notif tidak boleh kosong"}})
		return
	}

	token, err := h.tokens.AccessToken(ctx)
	if err != nil {
		h.log.Error("[HIRS] TOPIC_TOKEN_FAIL | %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "gagal ambil access token"}})
		return
	}

	// map[string]any{...} = object literal di Go, setara `{ message: { topic: to, ... } }`
	// TAPI harus eksplisit ditulis map[string]any (Go tidak infer tipe object literal
	// sebebas TS).
	payload := map[string]any{
		"message": map[string]any{
			"topic":        strings.TrimSpace(body.To),
			"notification": body.Notif,
			"data":         body.Data,
		},
	}

	status, respBody, err := h.sendNotificationFcm(ctx, payload, token)
	if err != nil {
		h.log.Error("[HIRS] TOPIC_FCM_ERROR | %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "No response received from the server"}})
		return
	}

	// Beda penting dari axios: http.Client Go TIDAK auto-throw untuk status
	// non-2xx. err di atas cuma error kalau network/koneksi gagal total.
	// Makanya status code dicek MANUAL di sini (axios biasanya udah masuk catch).
	if status >= 200 && status < 300 {
		h.log.Info("[HIRS] TOPIC_FCM_SENT | http=%d | userid=%s | topic=%s", status, orDash(body.UserID), orDash(body.To))
		writeJSON(w, status, map[string]any{"meta": map[string]any{"status": status, "messages": "Success sending notification"}})
		return
	}

	msg := fcmErrorMessage(respBody)
	h.log.Error("[HIRS] TOPIC_FCM_ERROR | status=%d | %s", status, msg)
	writeJSON(w, http.StatusOK, map[string]any{"meta": map[string]any{"status": 200, "messages": "Error sending notification: " + msg}})
}

// ttlUntilMidnightJakarta setara getTTLUntilMidnight() di hirs.ts, tapi eksplisit
// pakai timezone Asia/Jakarta (Node versi lama pakai timezone OS server).
func ttlUntilMidnightJakarta() int64 {
	loc, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		loc = time.FixedZone("WIB", 7*3600) // fallback kalau OS tidak punya data timezone IANA
	}
	now := time.Now().In(loc)
	midnight := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, loc)
	return midnight.Sub(now).Milliseconds()
}

// orDash: kalau string kosong, tampilkan "-" di log (biar gampang dibaca).
func orDash(s string) string {
	if s == "" {
		return "-"
	}
	return s
}

// sendNotificationByDeviceToken setara sendNotificationbyDeviceToken() di hirs.ts
// -- bedanya, ini TIDAK langsung hit FCM. Cuma push job ke RabbitMQ, nanti
// worker (worker.go) yang benar-benar kirim ke FCM secara async.
//
// Parameter pertama `_ context.Context` -- underscore artinya parameter ini
// SENGAJA tidak dipakai di dalam fungsi (Go akan error kalau ada variable
// dideklarasikan tapi tak dipakai, `_` itu cara bilang "saya tahu, abaikan saja").
func (h *Handler) sendNotificationByDeviceToken(_ context.Context, w http.ResponseWriter, body reqBody) {
	if strings.TrimSpace(body.To) == "" || len(body.Notif) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"meta": map[string]any{"statusCode": 400, "messages": "to/notif tidak boleh kosong"}})
		return
	}

	// rabbitmq.GetChannel() -- ambil channel singleton, setara getChannel() di rabbit.ts
	ch, err := rabbitmq.GetChannel()
	if err != nil {
		h.log.Error("[HIRS] DEVICE_CHANNEL_FAIL | %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "gagal connect RabbitMQ"}})
		return
	}

	createdAt := time.Now().UnixMilli() // setara Date.now()
	ttlMs := ttlUntilMidnightJakarta()
	jobID := fmt.Sprintf("%d-%s", createdAt, randHex(7)) // setara `${createdAt}-${Math.random()...}`

	jenis := body.Jenis
	if v := metaString(body.MetaData, "jenis"); v != "" {
		jenis = v
	}

	// Copy map body.MetaData ke map baru `metaData` -- setara spread `{...metaData, jenis}`
	// di JS. Go tidak punya spread operator untuk map, jadi manual pakai for-range.
	metaData := map[string]interface{}{}
	for k, v := range body.MetaData {
		metaData[k] = v
	}
	metaData["jenis"] = jenis

	// job := NotificationJob{...} -- bikin struct dengan "named fields" (kayak
	// object literal TS tapi field-nya sudah fix ditentukan oleh definisi struct
	// NotificationJob di types.go, tidak bisa nambah field sembarangan).
	job := NotificationJob{
		JobID:     jobID,
		CreatedAt: createdAt,
		TtlMs:     ttlMs,
		MetaData:  metaData,
		Message: NotificationPayload{
			Token:        strings.TrimSpace(body.To),
			Notification: body.Notif,
			Data:         body.Data,
			Android: map[string]interface{}{
				"priority": "high",
				// channel_id must match the app's Notifications.kt. Old app
				// versions without this channel fall back to their default one.
				"notification": map[string]any{
					"sound":                   "announcement.mp3",
					"channel_id":              "hris_critical_v3",
					"notification_priority":   "PRIORITY_MAX",
					"visibility":              "PUBLIC",
					"default_vibrate_timings": true,
				},
			},
			APNS: map[string]interface{}{
				// time-sensitive needs the app's time-sensitive entitlement;
				// without it iOS shows a normal alert with sound.
				"payload": map[string]any{"aps": map[string]any{
					"sound":              "default",
					"interruption-level": "time-sensitive",
				}},
				"headers": map[string]any{
					"mutable-content": "1",
					"apns-priority":   "10",
					"apns-push-type":  "alert",
				},
				"fcm_options": map[string]any{},
			},
		},
	}

	payload, _ := json.Marshal(job) // setara JSON.stringify(job)

	userID := metaString(metaData, "userid")
	numerator := metaString(metaData, "Numerator")
	pt := metaString(metaData, "PT")
	tokenMasked := maskToken(job.Message.Token)

	// ch.Publish(...) = ch.sendToQueue(...) versi Go (nama beda, konsep sama).
	// amqp.Table{...} itu header pesan, setara `headers: {...}` di amqplib Node.
	err = ch.Publish("", rabbitmq.QUEUE, false, false, amqp.Publishing{
		ContentType:  "application/json",
		Body:         payload,
		DeliveryMode: amqp.Persistent, // setara { persistent: true }
		Timestamp:    time.UnixMilli(createdAt),
		Expiration:   fmt.Sprintf("%d", ttlMs),
		Headers: amqp.Table{
			"x-retry":      int32(0),
			"x-job-id":     jobID,
			"x-userid":     userID,
			"x-jenis":      jenis,
			"x-created-at": createdAt,
			"x-ttl-ms":     ttlMs,
		},
	})
	if err != nil {
		h.log.Error("[HIRS] QUEUE_PUSH_FAIL | jobId=%s | userid=%s | numerator=%s | PT=%s | token=%s | err=%v", jobID, userID, numerator, pt, tokenMasked, err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "Queue buffer penuh, coba lagi"}})
		return
	}

	h.log.Info("[HIRS] QUEUE_PUSH_OK | jobId=%s | userid=%s | numerator=%s | PT=%s | jenis=%s | token=%s | title=%s", jobID, userID, numerator, pt, jenis, tokenMasked, orDash(body.Notif["title"]))

	writeJSON(w, http.StatusOK, map[string]any{
		"meta": map[string]any{
			"code":     100,
			"status":   "Success",
			"messages": "Notification queued successfully",
			"jobId":    jobID,
		},
	})
}
