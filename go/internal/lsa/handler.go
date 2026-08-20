// Package lsa: HTTP handler setara src/controller/LSA/lsa.ts + routes/LSA/modify.ts
package lsa

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"

	"hris-notif-go/internal/fcmauth"
	"hris-notif-go/internal/logger"
	"hris-notif-go/internal/rabbitmq"
)

const fcmProjectID = "lsamobile"

const httpTimeout = 15 * time.Second

// fcmTransport: reuse koneksi ke fcm.googleapis.com, lihat catatan di internal/hris/handler.go.
var fcmTransport = &http.Transport{
	MaxIdleConns:        100,
	MaxIdleConnsPerHost: 50,
	IdleConnTimeout:     90 * time.Second,
}

type Handler struct {
	tokens *fcmauth.TokenProvider
	log    *logger.Logger
	client *http.Client
}

func NewHandler(tokens *fcmauth.TokenProvider, log *logger.Logger) *Handler {
	return &Handler{tokens: tokens, log: log, client: &http.Client{Timeout: httpTimeout, Transport: fcmTransport}}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/LSA/modify", h.modify)
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
		writeJSON(w, http.StatusBadRequest, map[string]any{"meta": map[string]any{"status": 400, "messages": "to atau data tidak boleh kosong"}})
		return
	}

	token, err := h.tokens.AccessToken(r.Context())
	if err != nil {
		h.log.Error("[LSA] TOPIC_TOKEN_FAIL | %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "gagal ambil access token"}})
		return
	}

	status, respBody, err := postFCM(r.Context(), h.client, fcmProjectID, map[string]any{
		"message": map[string]any{
			"topic":        body.To,
			"notification": body.Notif,
			"data":         body.Data,
		},
	}, token)
	if err != nil {
		h.log.Error("[LSA] TOPIC_FCM_ERROR | %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "No response received from the server"}})
		return
	}

	if status >= 200 && status < 300 {
		writeJSON(w, status, map[string]any{"meta": map[string]any{"code": 100, "status": "Success", "messages": "Success sending notification"}})
		return
	}

	msg := fcmErrorMessage(respBody)
	h.log.Error("[LSA] TOPIC_FCM_ERROR | status=%d | %s", status, msg)
	writeJSON(w, http.StatusOK, map[string]any{"meta": map[string]any{"code": 200, "status": "Failed", "messages": "Error sending notification: " + msg}})
}

func (h *Handler) sendNotificationByDeviceToken(w http.ResponseWriter, body reqBody) {
	if strings.TrimSpace(body.To) == "" || len(body.Notif) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"meta": map[string]any{"status": 400, "messages": "to atau notif tidak boleh kosong"}})
		return
	}

	ch, err := rabbitmq.GetChannel()
	if err != nil {
		h.log.Error("[LSA] QUEUE_CHANNEL_FAIL | %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "Failed to queue notification"}})
		return
	}

	job := map[string]any{
		"message": map[string]any{
			"token":        strings.TrimSpace(body.To),
			"notification": body.Notif,
			"data":         body.Data,
		},
	}
	payload, _ := json.Marshal(job)

	err = ch.Publish("", rabbitmq.LSA_QUEUE, false, false, amqp.Publishing{
		DeliveryMode: amqp.Persistent,
		Body:         payload,
	})
	if err != nil {
		h.log.Error("[LSA] QUEUE_PUSH_FAIL | %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "Failed to queue notification"}})
		return
	}

	h.log.Info("[LSA] QUEUED | tokenTo=%s", maskToken(body.To))
	writeJSON(w, http.StatusOK, map[string]any{"meta": map[string]any{"code": 100, "status": "Success", "messages": "Notification queued successfully"}})
}

func maskToken(token string) string {
	if len(token) < 10 {
		return token
	}
	return token[:6] + "..." + token[len(token)-4:]
}
