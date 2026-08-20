// Package basramobile: HTTP handler setara controller/BasraMobile/basraMobile.ts.
// Beda dari HRIS/LSA/Wellness -- modul ini TIDAK punya worker/queue sama sekali,
// kedua jenis ('sendingNotifbyTopic' dan 'sendingNotifbyDeviceToken') sama-sama
// hit FCM langsung secara sinkron (client nunggu sampai FCM selesai).
package basramobile

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"hris-notif-go/internal/fcmauth"
	"hris-notif-go/internal/logger"
)

const fcmURL = "https://fcm.googleapis.com/v1/projects/basra-mobile-86f72/messages:send"
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
	mux.HandleFunc("/BASRAMOBILE/modify", h.modify)
}

type reqBody struct {
	Jenis string             `json:"jenis"`
	To    string             `json:"to"`
	Notif map[string]string  `json:"notif"`
	Data  map[string]string  `json:"data"`
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
		h.send(r, w, body, "topic")
	case "sendingNotifbyDeviceToken":
		h.send(r, w, body, "token")
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

// send: satu fungsi untuk topic maupun device token, sama-sama sinkron ke FCM
// -- bedanya cuma key JSON ("topic" vs "token"), sesuai controller Node aslinya.
func (h *Handler) send(r *http.Request, w http.ResponseWriter, body reqBody, targetKey string) {
	if strings.TrimSpace(body.To) == "" || len(body.Notif) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"meta": map[string]any{"status": 400, "messages": "to atau data tidak boleh kosong"}})
		return
	}

	token, err := h.tokens.AccessToken(r.Context())
	if err != nil {
		h.log.Error("[BASRAMOBILE] TOKEN_FAIL | %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "gagal ambil access token"}})
		return
	}

	buf, _ := json.Marshal(map[string]any{
		"message": map[string]any{
			targetKey:      strings.TrimSpace(body.To),
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
		h.log.Error("[BASRAMOBILE] FCM_ERROR | %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "No response received from the server"}})
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		writeJSON(w, resp.StatusCode, map[string]any{"meta": map[string]any{"status": resp.StatusCode, "messages": "Success sending notification"}})
		return
	}

	msg := fcmErrorMessage(respBody)
	h.log.Error("[BASRAMOBILE] FCM_ERROR | status=%d | %s", resp.StatusCode, msg)
	writeJSON(w, http.StatusOK, map[string]any{"meta": map[string]any{"code": 100, "status": "Failed", "messages": "Error sending notification: " + msg}})
}
