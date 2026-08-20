// groupkey.go setara src/controller/HIRS/CreateNotificationKey/createNotificationkey.ts
package hris

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
)

const (
	notifKeyURL    = "https://fcm.googleapis.com/fcm/notification"
	notifProjectID = "859317105403"
)

func (h *Handler) groupKeyHeaders(accessToken string) http.Header {
	hdr := http.Header{}
	hdr.Set("Content-Type", "application/json")
	hdr.Set("access_token_auth", "true")
	hdr.Set("Authorization", "Bearer "+accessToken)
	hdr.Set("project_id", notifProjectID)
	return hdr
}

func (h *Handler) postNotificationKey(ctx context.Context, w http.ResponseWriter, accessToken string, reqBody map[string]any) {
	buf, _ := json.Marshal(reqBody)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, notifKeyURL, bytes.NewReader(buf))
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"meta": map[string]any{"code": 200, "status": "Failed", "messages": err.Error()}})
		return
	}
	req.Header = h.groupKeyHeaders(accessToken)

	resp, err := h.client.Do(req)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"meta": map[string]any{"code": 200, "status": "Failed", "messages": err.Error()}})
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var parsed any
		if json.Unmarshal(respBody, &parsed) != nil {
			parsed = string(respBody)
		}
		writeJSON(w, http.StatusOK, map[string]any{"meta": map[string]any{"code": 200, "status": "Failed", "messages": parsed}})
		return
	}

	var parsed struct {
		NotificationKey string `json:"notification_key"`
	}
	_ = json.Unmarshal(respBody, &parsed)

	writeJSON(w, resp.StatusCode, map[string]any{"meta": map[string]any{"code": 100, "status": "Success", "notification_key": parsed.NotificationKey}})
}

func validateGroupFields(w http.ResponseWriter, body reqBody) bool {
	if body.NotificationKeyName == "" || len(body.RegistrationIDs) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"meta": map[string]any{"code": 400, "status": "Failed", "error": "notification_key_name and registration_ids are required"}})
		return false
	}
	return true
}

func (h *Handler) createNotificationKey(ctx context.Context, w http.ResponseWriter, body reqBody) {
	if !validateGroupFields(w, body) {
		return
	}
	token, err := h.tokens.AccessToken(ctx)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"meta": map[string]any{"code": 200, "status": "Failed", "messages": err.Error()}})
		return
	}
	h.postNotificationKey(ctx, w, token, map[string]any{
		"operation":            "create",
		"notification_key_name": body.NotificationKeyName,
		"registration_ids":     body.RegistrationIDs,
	})
}

// groupOp menangani "add" dan "remove" (addUsertoGroup / removeUserFromGroup di Node)
func (h *Handler) groupOp(ctx context.Context, w http.ResponseWriter, body reqBody, operation string) {
	if !validateGroupFields(w, body) {
		return
	}
	token, err := h.tokens.AccessToken(ctx)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"meta": map[string]any{"code": 200, "status": "Failed", "messages": err.Error()}})
		return
	}
	h.postNotificationKey(ctx, w, token, map[string]any{
		"operation":             operation,
		"notification_key_name": body.NotificationKeyName,
		"notification_key":      body.NotificationKey,
		"registration_ids":      body.RegistrationIDs,
	})
}
