package instagram

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"time"

	"hris-notif-go/internal/logger"
)

var httpTransport = &http.Transport{
	MaxIdleConns:        50,
	MaxIdleConnsPerHost: 20,
	IdleConnTimeout:     90 * time.Second,
}

type Handler struct {
	log    *logger.Logger
	client *http.Client
}

func NewHandler(log *logger.Logger) *Handler {
	return &Handler{log: log, client: &http.Client{Timeout: 15 * time.Second, Transport: httpTransport}}
}

// RegisterRoutes: path SENGAJA huruf kecil (/instagram/callback, dst), BEDA
// dari konvensi HRIS/LSA/dkk yang uppercase -- karena /instagram/callback
// itu redirect_uri yang terdaftar di Meta/Instagram App Dashboard (pihak
// eksternal), harus cocok PERSIS termasuk huruf besar/kecilnya. Ubah path
// di sini TANPA update redirect_uri di Meta App Dashboard akan bikin OAuth
// login gagal total.
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/instagram/callback", h.callback)
	mux.HandleFunc("/instagram/long-lived-token", h.longLivedToken)
	mux.HandleFunc("/instagram/token", h.getStoredToken)
	mux.HandleFunc("/instagram/media", h.getMedia)
}

func writeJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func igErrorMessage(body []byte) string {
	var parsed struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
		ErrorMessage string `json:"error_message"`
	}
	if json.Unmarshal(body, &parsed) == nil {
		if parsed.ErrorMessage != "" {
			return parsed.ErrorMessage
		}
		if parsed.Error.Message != "" {
			return parsed.Error.Message
		}
	}
	return string(body)
}

// callback: Instagram redirect ke sini setelah user authorize (GET, query string).
func (h *Handler) callback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"meta": map[string]any{"status": 405, "messages": "method not allowed"}})
		return
	}

	q := r.URL.Query()
	if errParam := q.Get("error"); errParam != "" {
		h.log.Error("Instagram OAuth error: %s - %s", q.Get("error_reason"), q.Get("error_description"))
		writeJSON(w, http.StatusBadRequest, map[string]any{"meta": map[string]any{"status": 400, "messages": "Instagram OAuth denied: " + q.Get("error_description")}})
		return
	}

	code := q.Get("code")
	if code == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"meta": map[string]any{"status": 400, "messages": "Authorization code tidak ditemukan"}})
		return
	}

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	_ = mw.WriteField("client_id", os.Getenv("INSTAGRAM_CLIENT_ID"))
	_ = mw.WriteField("client_secret", os.Getenv("INSTAGRAM_CLIENT_SECRET"))
	_ = mw.WriteField("grant_type", "authorization_code")
	_ = mw.WriteField("redirect_uri", os.Getenv("INSTAGRAM_REDIRECT_URI"))
	_ = mw.WriteField("code", code)
	_ = mw.Close()

	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, "https://api.instagram.com/oauth/access_token", &buf)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "gagal membuat request"}})
		return
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())

	resp, err := h.client.Do(req)
	if err != nil {
		h.log.Error("Instagram OAuth token exchange failed: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "Gagal tukar token: " + err.Error()}})
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := igErrorMessage(respBody)
		h.log.Error("Instagram OAuth token exchange failed: %s", msg)
		writeJSON(w, resp.StatusCode, map[string]any{"meta": map[string]any{"status": resp.StatusCode, "messages": "Gagal tukar token: " + msg}})
		return
	}

	var parsed struct {
		AccessToken string `json:"access_token"`
		UserID      any    `json:"user_id"`
	}
	if json.Unmarshal(respBody, &parsed) != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "gagal parse response Instagram"}})
		return
	}

	h.log.Info("Instagram OAuth success | user_id: %v", parsed.UserID)
	writeJSON(w, http.StatusOK, map[string]any{
		"meta": map[string]any{"status": 200, "messages": "Instagram OAuth berhasil"},
		"data": map[string]any{"access_token": parsed.AccessToken, "user_id": parsed.UserID},
	})
}

// longLivedToken: tukar short-lived token (1 jam) -> long-lived (60 hari), simpan ke file.
func (h *Handler) longLivedToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"meta": map[string]any{"status": 405, "messages": "method not allowed"}})
		return
	}

	var body struct {
		AccessToken  string `json:"access_token"`
		ClientSecret string `json:"client_secret"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"meta": map[string]any{"status": 400, "messages": "invalid JSON body"}})
		return
	}

	secret := body.ClientSecret
	if secret == "" {
		secret = os.Getenv("INSTAGRAM_CLIENT_SECRET")
	}

	if body.AccessToken == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"meta": map[string]any{"status": 400, "messages": "access_token wajib diisi"}})
		return
	}
	if secret == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"meta": map[string]any{"status": 400, "messages": "client_secret wajib diisi (atau set INSTAGRAM_CLIENT_SECRET di env)"}})
		return
	}

	reqURL := "https://graph.instagram.com/access_token?" + url.Values{
		"grant_type":    {"ig_exchange_token"},
		"client_secret": {secret},
		"access_token":  {body.AccessToken},
	}.Encode()

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, reqURL, nil)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "gagal membuat request"}})
		return
	}
	resp, err := h.client.Do(req)
	if err != nil {
		h.log.Error("Instagram exchange long-lived token gagal: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "Gagal exchange token: " + err.Error()}})
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := igErrorMessage(respBody)
		h.log.Error("Instagram exchange long-lived token gagal: %s", msg)
		writeJSON(w, resp.StatusCode, map[string]any{"meta": map[string]any{"status": resp.StatusCode, "messages": "Gagal exchange token: " + msg}})
		return
	}

	var parsed struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		ExpiresIn   int64  `json:"expires_in"`
	}
	if json.Unmarshal(respBody, &parsed) != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "gagal parse response Instagram"}})
		return
	}

	expiredAt := time.Now().Add(time.Duration(parsed.ExpiresIn) * time.Second).UTC().Format(time.RFC3339)
	if err := SaveToken(parsed.AccessToken, parsed.TokenType, parsed.ExpiresIn, expiredAt); err != nil {
		h.log.Error("gagal simpan token Instagram: %v", err)
	}

	h.log.Info("Instagram long-lived token disimpan | expired: %s", expiredAt)
	writeJSON(w, http.StatusOK, map[string]any{
		"meta": map[string]any{"status": 200, "messages": "Token berhasil diperbarui (60 hari) dan disimpan"},
		"data": map[string]any{"access_token": parsed.AccessToken, "token_type": parsed.TokenType, "expires_in": parsed.ExpiresIn, "expired_at": expiredAt},
	})
}

func (h *Handler) getStoredToken(w http.ResponseWriter, r *http.Request) {
	t := ReadToken()
	if t == nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"meta": map[string]any{"status": 404, "messages": "Token belum ada, panggil /long-lived-token dulu"}})
		return
	}

	expired := IsTokenExpired()
	msg := "Token aktif"
	if expired {
		msg = "Token sudah expired!"
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"meta": map[string]any{"status": 200, "messages": msg},
		"data": map[string]any{
			"access_token": t.AccessToken, "token_type": t.TokenType, "expires_in": t.ExpiresIn,
			"expired_at": t.ExpiredAt, "saved_at": t.SavedAt, "is_expired": expired,
		},
	})
}

func (h *Handler) getMedia(w http.ResponseWriter, r *http.Request) {
	t := ReadToken()
	if t == nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"meta": map[string]any{"status": 404, "messages": "Token belum ada, panggil /long-lived-token dulu"}})
		return
	}
	if IsTokenExpired() {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"meta": map[string]any{"status": 401, "messages": "Token sudah expired, perbarui token dulu"}})
		return
	}

	reqURL := "https://graph.instagram.com/v25.0/me/media?" + url.Values{
		"fields":       {"id,media_type,media_url,thumbnail_url,permalink,timestamp,caption"},
		"access_token": {t.AccessToken},
	}.Encode()

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, reqURL, nil)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "gagal membuat request"}})
		return
	}
	resp, err := h.client.Do(req)
	if err != nil {
		h.log.Error("Instagram fetch media gagal: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "Gagal fetch media: " + err.Error()}})
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := igErrorMessage(respBody)
		h.log.Error("Instagram fetch media gagal: %s", msg)
		writeJSON(w, resp.StatusCode, map[string]any{"meta": map[string]any{"status": resp.StatusCode, "messages": "Gagal fetch media: " + msg}})
		return
	}

	var parsed struct {
		Data   []any `json:"data"`
		Paging any   `json:"paging"`
	}
	if json.Unmarshal(respBody, &parsed) != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"meta": map[string]any{"status": 500, "messages": "gagal parse response Instagram"}})
		return
	}

	h.log.Info("Instagram media fetched | total: %d", len(parsed.Data))
	writeJSON(w, http.StatusOK, map[string]any{
		"meta":   map[string]any{"status": 200, "messages": "Berhasil fetch media Instagram"},
		"data":   parsed.Data,
		"paging": parsed.Paging,
	})
}
