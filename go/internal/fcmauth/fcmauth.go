// Package fcmauth mengambil & cache access token OAuth2 dari service account
// Firebase, setara token_firebase_service_*.ts + *Token.ts (cache 55 menit)
// di project Node. Bedanya, di sini caching+refresh otomatis ditangani oleh
// package golang.org/x/oauth2 (oauth2.ReuseTokenSource) -- tidak perlu logic
// cache manual seperti di Node.
package fcmauth

import (
	"context"
	"encoding/json"
	"os"
	"sync"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

const Scope = "https://www.googleapis.com/auth/firebase.messaging"

type TokenProvider struct {
	// ProjectID diambil dari field project_id di service account JSON.
	ProjectID string

	mu     sync.Mutex
	makeTS func(ctx context.Context) oauth2.TokenSource
	src    oauth2.TokenSource
}

// NewTokenProvider membaca file service-account JSON dari credentialFile.
func NewTokenProvider(credentialFile string) (*TokenProvider, error) {
	data, err := os.ReadFile(credentialFile)
	if err != nil {
		return nil, err
	}
	cfg, err := google.JWTConfigFromJSON(data, Scope)
	if err != nil {
		return nil, err
	}

	var meta struct {
		ProjectID string `json:"project_id"`
	}
	_ = json.Unmarshal(data, &meta)

	tp := &TokenProvider{
		ProjectID: meta.ProjectID,
		makeTS: func(ctx context.Context) oauth2.TokenSource {
			return cfg.TokenSource(ctx)
		},
	}
	tp.src = oauth2.ReuseTokenSource(nil, tp.makeTS(context.Background()))
	return tp, nil
}

// AccessToken ambil token dari cache (auto-refresh kalau sudah dekat expired).
func (p *TokenProvider) AccessToken(ctx context.Context) (string, error) {
	p.mu.Lock()
	src := p.src
	p.mu.Unlock()

	tok, err := src.Token()
	if err != nil {
		return "", err
	}
	return tok.AccessToken, nil
}

// ForceRefresh buang cache & minta token baru ke Google, dipanggil saat FCM
// balas 401 walau menurut cache token masih valid -- setara clearCachedToken()
// di Node lalu getCachedToken() lagi.
func (p *TokenProvider) ForceRefresh(ctx context.Context) (string, error) {
	p.mu.Lock()
	p.src = oauth2.ReuseTokenSource(nil, p.makeTS(ctx))
	src := p.src
	p.mu.Unlock()

	tok, err := src.Token()
	if err != nil {
		return "", err
	}
	return tok.AccessToken, nil
}
