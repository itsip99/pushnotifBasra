// Package instagram: setara controller/instagram/instagram.ts + services/instagram/*.ts.
// CATATAN: modul ini BUKAN push notifikasi -- tidak ada FCM sama sekali di sini.
// Isinya cuma OAuth token exchange (Instagram Graph API) + fetch media, dipakai
// buat nampilin feed Instagram, bukan buat kirim notif ke HP.
package instagram

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"
)

// tokenFile: default-nya SENGAJA sama persis dengan path yang dipakai Node
// (../../../data/instagram_token.json dari src/services/instagram/, yang
// resolve ke <root project>/data/instagram_token.json) -- supaya kalau
// proses Node & Go ini sempat jalan berdampingan selama migrasi, keduanya
// baca/tulis file token yang SAMA, tidak ada 2 sumber kebenaran token yang beda.
func tokenFile() string {
	if v := os.Getenv("INSTAGRAM_TOKEN_FILE"); v != "" {
		return v
	}
	return filepath.Join("data", "instagram_token.json")
}

type TokenData struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int64  `json:"expires_in"`
	ExpiredAt   string `json:"expired_at"`
	SavedAt     string `json:"saved_at"`
}

func ensureDir() {
	dir := filepath.Dir(tokenFile())
	_ = os.MkdirAll(dir, 0755)
}

func SaveToken(accessToken, tokenType string, expiresIn int64, expiredAt string) error {
	ensureDir()
	payload := TokenData{
		AccessToken: accessToken,
		TokenType:   tokenType,
		ExpiresIn:   expiresIn,
		ExpiredAt:   expiredAt,
		SavedAt:     time.Now().UTC().Format(time.RFC3339),
	}
	b, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(tokenFile(), b, 0644)
}

func ReadToken() *TokenData {
	b, err := os.ReadFile(tokenFile())
	if err != nil {
		return nil
	}
	var t TokenData
	if json.Unmarshal(b, &t) != nil {
		return nil
	}
	return &t
}

func IsTokenExpired() bool {
	t := ReadToken()
	if t == nil {
		return true
	}
	expiredAt, err := time.Parse(time.RFC3339, t.ExpiredAt)
	if err != nil {
		return true
	}
	return time.Now().After(expiredAt)
}
