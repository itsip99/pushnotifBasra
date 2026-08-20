package javayoga

import (
	"encoding/json"
	"net/http"
	"strings"

	amqp "github.com/rabbitmq/amqp091-go"

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
	mux.HandleFunc("/JAVAYOGA/modify", h.modify)
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
		h.log.Error("[JAVAYOGA] TOPIC_TOKEN_FAIL | %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "gagal ambil access token"}})
		return
	}

	status, respBody, err := postFCM(r.Context(), h.client, map[string]any{
		"message": map[string]any{
			"topic":        strings.TrimSpace(body.To),
			"notification": body.Notif,
			"data":         body.Data,
		},
	}, token)
	if err != nil {
		h.log.Error("[JAVAYOGA] TOPIC_FCM_ERROR | %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "No response received from the server"}})
		return
	}

	if status >= 200 && status < 300 {
		writeJSON(w, status, map[string]any{"meta": map[string]any{"code": 100, "status": "Success", "messages": "Success sending notification"}})
		return
	}

	msg := fcmErrorMessage(respBody)
	h.log.Error("[JAVAYOGA] TOPIC_FCM_ERROR | status=%d | %s", status, msg)
	writeJSON(w, http.StatusOK, map[string]any{"meta": map[string]any{"code": 200, "status": "Failed", "messages": "Error sending notification: " + msg}})
}

// sendNotificationByDeviceToken: job SEDERHANA (cuma { message }), sama seperti
// LSA -- worker JavaYoga (worker.go) tidak wajib createdAt/ttlMs (kalau tidak
// ada, isExpired() dianggap tidak pernah expired, sama seperti versi Node-nya).
func (h *Handler) sendNotificationByDeviceToken(w http.ResponseWriter, body reqBody) {
	if strings.TrimSpace(body.To) == "" || len(body.Notif) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"meta": map[string]any{"status": 400, "messages": "to atau notif tidak boleh kosong"}})
		return
	}

	ch, err := rabbitmq.GetChannel()
	if err != nil {
		h.log.Error("[JAVAYOGA] QUEUE_CHANNEL_FAIL | %v", err)
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

	err = ch.Publish("", rabbitmq.JAVA_QUEUE, false, false, amqp.Publishing{
		DeliveryMode: amqp.Persistent,
		Body:         payload,
	})
	if err != nil {
		h.log.Error("[JAVAYOGA] QUEUE_PUSH_FAIL | %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "Failed to queue notification"}})
		return
	}

	h.log.Info("[JAVAYOGA] QUEUED | tokenTo=%s", maskToken(body.To))
	writeJSON(w, http.StatusOK, map[string]any{"meta": map[string]any{"code": 100, "status": "Success", "messages": "Notification queued successfully"}})
}

func maskToken(token string) string {
	if len(token) < 10 {
		return token
	}
	return token[:6] + "..." + token[len(token)-4:]
}
