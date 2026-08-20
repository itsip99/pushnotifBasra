// Package wellness: HTTP handler setara controller/LSA/lsa.ts + routes/LSA/modify.ts,
// tapi untuk modul Wellness -- endpoint ini BARU, sebelumnya modul Wellness
// cuma punya worker (job dikirim langsung ke queue oleh caller eksternal).
package wellness

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"

	crand "crypto/rand"

	"hris-notif-go/internal/fcmauth"
	"hris-notif-go/internal/logger"
	"hris-notif-go/internal/rabbitmq"
)

type Handler struct {
	tokens *fcmauth.TokenProvider
	log    *logger.Logger
	client *http.Client
}

func NewHandler(tokens *fcmauth.TokenProvider, log *logger.Logger) *Handler {
	return &Handler{tokens: tokens, log: log, client: &http.Client{Timeout: httpTimeout, Transport: fcmTransport}}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/WELLNESS/modify", h.modify)
}

type reqBody struct {
	Jenis    string                 `json:"jenis"`
	To       string                 `json:"to"`
	Notif    map[string]string      `json:"notif"`
	Data     map[string]string      `json:"data"`
	MetaData map[string]interface{} `json:"metaData"`
}

func writeJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func (h *Handler) modify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"meta": map[string]any{"code": 405, "messages": "method not allowed"}})
		return
	}

	var body reqBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"meta": map[string]any{"code": 400, "messages": "invalid JSON body"}})
		return
	}

	switch body.Jenis {
	case "sendingNotifbyTopic":
		h.sendNotificationByTopic(r, w, body)
	case "sendingNotifbyDeviceToken":
		h.sendNotificationByDeviceToken(w, body)
	default:
		writeJSON(w, http.StatusBadRequest, map[string]any{"meta": map[string]any{"code": 400, "messages": "Invalid jenis value"}})
	}
}

func (h *Handler) sendNotificationByTopic(r *http.Request, w http.ResponseWriter, body reqBody) {
	if strings.TrimSpace(body.To) == "" || len(body.Notif) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"meta": map[string]any{"status": 400, "messages": "to atau notif tidak boleh kosong"}})
		return
	}

	token, err := h.tokens.AccessToken(r.Context())
	if err != nil {
		h.log.Error("[WELLNESS] TOPIC_TOKEN_FAIL | %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "gagal ambil access token"}})
		return
	}

	buf, _ := json.Marshal(map[string]any{
		"message": map[string]any{
			"topic":        strings.TrimSpace(body.To),
			"notification": body.Notif,
			"data":         body.Data,
		},
	})
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, fcmURL, bytes.NewReader(buf))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "gagal membuat request"}})
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := h.client.Do(req)
	if err != nil {
		h.log.Error("[WELLNESS] TOPIC_FCM_ERROR | %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "No response received from the server"}})
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		writeJSON(w, resp.StatusCode, map[string]any{"meta": map[string]any{"code": 100, "status": "Success", "messages": "Success sending notification"}})
		return
	}

	msg := fcmErrorMessage(respBody)
	h.log.Error("[WELLNESS] TOPIC_FCM_ERROR | status=%d | %s", resp.StatusCode, msg)
	writeJSON(w, http.StatusOK, map[string]any{"meta": map[string]any{"code": 200, "status": "Failed", "messages": "Error sending notification: " + msg}})
}

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = crand.Read(b)
	return hex.EncodeToString(b)
}

// ttlUntilMidnightJakarta setara getTTLUntilMidnight() di controller Node.
func ttlUntilMidnightJakarta() int64 {
	loc, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		loc = time.FixedZone("WIB", 7*3600)
	}
	now := time.Now().In(loc)
	midnight := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, loc)
	return midnight.Sub(now).Milliseconds()
}

// sendNotificationByDeviceToken push job LENGKAP (jobId/createdAt/ttlMs) ke
// WELLNESS_QUEUE -- beda dari LSA yang cuma push { message } polos, karena
// worker Wellness (worker.go) butuh CreatedAt/TtlMs buat isExpired()/canRetry().
func (h *Handler) sendNotificationByDeviceToken(w http.ResponseWriter, body reqBody) {
	if strings.TrimSpace(body.To) == "" || len(body.Notif) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"meta": map[string]any{"status": 400, "messages": "to atau notif tidak boleh kosong"}})
		return
	}

	ch, err := rabbitmq.GetChannel()
	if err != nil {
		h.log.Error("[WELLNESS] QUEUE_CHANNEL_FAIL | %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "Failed to queue notification"}})
		return
	}

	createdAt := time.Now().UnixMilli()
	ttlMs := ttlUntilMidnightJakarta()
	jobID := fmt.Sprintf("%d-%s", createdAt, randHex(7))

	metaData := map[string]interface{}{}
	for k, v := range body.MetaData {
		metaData[k] = v
	}

	job := WellnessJob{
		JobID:     jobID,
		CreatedAt: createdAt,
		TtlMs:     ttlMs,
		MetaData:  metaData,
		Message: NotificationPayload{
			Token:        strings.TrimSpace(body.To),
			Notification: body.Notif,
			Data:         body.Data,
		},
	}
	payload, _ := json.Marshal(job)

	err = ch.Publish("", rabbitmq.WELLNESS_QUEUE, false, false, amqp.Publishing{
		ContentType:  "application/json",
		Body:         payload,
		DeliveryMode: amqp.Persistent,
		Timestamp:    time.UnixMilli(createdAt),
		Expiration:   fmt.Sprintf("%d", ttlMs),
		Headers: amqp.Table{
			"x-retry":  int32(0),
			"x-job-id": jobID,
		},
	})
	if err != nil {
		h.log.Error("[WELLNESS] QUEUE_PUSH_FAIL | jobId=%s | %v", jobID, err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "Failed to queue notification"}})
		return
	}

	h.log.Info("[WELLNESS] QUEUED | jobId=%s | tokenTo=%s", jobID, maskToken(body.To))
	writeJSON(w, http.StatusOK, map[string]any{"meta": map[string]any{"code": 100, "status": "Success", "messages": "Notification queued successfully", "jobId": jobID}})
}

func maskToken(token string) string {
	if len(token) < 10 {
		return token
	}
	return token[:6] + "..." + token[len(token)-4:]
}
