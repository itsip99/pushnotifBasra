// Package fixupmoto: HTTP handler setara controller/FixupMoto/fixupmoto.ts.
// Topic dikirim sinkron ke FCM; device token di-queue ke FIXUPMOTO_QUEUE
// dan dikirim oleh worker.go (cmd/worker-fixupmoto).
package fixupmoto

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"

	"hris-notif-go/internal/fcmauth"
	"hris-notif-go/internal/logger"
	"hris-notif-go/internal/rabbitmq"
)

const httpTimeout = 15 * time.Second

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
	mux.HandleFunc("/FIXUPMOTO/modify", h.modify)
}

type reqBody struct {
	Jenis string            `json:"jenis"`
	To    string            `json:"to"`
	Notif map[string]string `json:"notif"`
	Data  map[string]string `json:"data"`
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
		h.sendByTopic(r, w, body)
	case "sendingNotifbyDeviceToken":
		h.sendByDeviceToken(w, body)
	default:
		writeJSON(w, http.StatusBadRequest, map[string]any{"meta": map[string]any{"code": 400, "messages": "Invalid jenis value"}})
	}
}

func fcmErrorMessage(body []byte) string {
	var parsed struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal(body, &parsed) == nil && parsed.Error.Message != "" {
		return parsed.Error.Message
	}
	return string(body)
}

// fcmURL: project diambil dari credential supaya tidak "SenderId mismatch".
func fcmURL(projectID string) string {
	return "https://fcm.googleapis.com/v1/projects/" + projectID + "/messages:send"
}

func postFCM(ctx context.Context, client *http.Client, projectID string, payload map[string]any, accessToken string) (int, []byte, error) {
	buf, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fcmURL(projectID), bytes.NewReader(buf))
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, body, nil
}

func (h *Handler) sendByTopic(r *http.Request, w http.ResponseWriter, body reqBody) {
	if strings.TrimSpace(body.To) == "" || len(body.Notif) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"meta": map[string]any{"status": 400, "messages": "to atau data tidak boleh kosong"}})
		return
	}

	token, err := h.tokens.AccessToken(r.Context())
	if err != nil {
		h.log.Error("[FIXUPMOTO] TOKEN_FAIL | %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "gagal ambil access token"}})
		return
	}

	status, respBody, err := postFCM(r.Context(), h.client, h.tokens.ProjectID, map[string]any{
		"message": map[string]any{
			"topic":        strings.TrimSpace(body.To),
			"notification": body.Notif,
			"data":         body.Data,
		},
	}, token)
	if err != nil {
		h.log.Error("[FIXUPMOTO] FCM_ERROR | %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "No response received from the server"}})
		return
	}

	if status >= 200 && status < 300 {
		writeJSON(w, status, map[string]any{"meta": map[string]any{"code": 100, "status": "Success", "messages": "Success sending notification"}})
		return
	}

	msg := fcmErrorMessage(respBody)
	h.log.Error("[FIXUPMOTO] FCM_ERROR | status=%d | %s", status, msg)
	writeJSON(w, http.StatusOK, map[string]any{"meta": map[string]any{"status": status, "messages": "Error sending notification: " + msg}})
}

// sendByDeviceToken: format job sama dengan src/controller/FixupMoto/fixupmoto.ts
// supaya worker Node dan Go bisa saling konsumsi.
func (h *Handler) sendByDeviceToken(w http.ResponseWriter, body reqBody) {
	if strings.TrimSpace(body.To) == "" || len(body.Notif) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"meta": map[string]any{"status": 400, "messages": "to atau data tidak boleh kosong"}})
		return
	}

	ch, err := rabbitmq.GetChannel()
	if err != nil {
		h.log.Error("[FIXUPMOTO] QUEUE_CHANNEL_FAIL | %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "Failed to queue notification"}})
		return
	}

	payload, _ := json.Marshal(map[string]any{
		"message": map[string]any{
			"token":        strings.TrimSpace(body.To),
			"notification": body.Notif,
			"data":         body.Data,
		},
	})

	err = ch.Publish("", rabbitmq.FIXUPMOTO_QUEUE, false, false, amqp.Publishing{
		DeliveryMode: amqp.Persistent,
		Body:         payload,
	})
	if err != nil {
		h.log.Error("[FIXUPMOTO] QUEUE_PUSH_FAIL | %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "Failed to queue notification"}})
		return
	}

	h.log.Info("[FIXUPMOTO] QUEUED | tokenTo=%s", maskToken(body.To))
	writeJSON(w, http.StatusOK, map[string]any{"meta": map[string]any{"code": 100, "status": "Success", "messages": "Notification queued successfully"}})
}

func maskToken(token string) string {
	if len(token) < 10 {
		return token
	}
	return token[:6] + "..." + token[len(token)-4:]
}
