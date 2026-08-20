package instagram

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"time"

	"hris-notif-go/internal/logger"
)

const refreshBeforeDays = 10 // refresh kalau sisa < 10 hari

func jakarta() *time.Location {
	loc, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		return time.FixedZone("WIB", 7*3600)
	}
	return loc
}

func refreshToken(log *logger.Logger, client *http.Client) {
	t := ReadToken()
	if t == nil {
		log.Info("[INSTAGRAM CRON] Token belum ada, skip refresh")
		return
	}

	expiredAt, err := time.Parse(time.RFC3339, t.ExpiredAt)
	if err != nil {
		log.Error("[INSTAGRAM CRON] expired_at tidak valid: %v", err)
		return
	}
	diffDays := int(time.Until(expiredAt).Hours() / 24)

	if diffDays > refreshBeforeDays {
		log.Info("[INSTAGRAM CRON] Token masih aman | sisa: %d hari", diffDays)
		return
	}

	log.Info("[INSTAGRAM CRON] Token hampir expired (%d hari lagi), mulai refresh...", diffDays)

	reqURL := "https://graph.instagram.com/refresh_access_token?" + url.Values{
		"grant_type":   {"ig_refresh_token"},
		"access_token": {t.AccessToken},
	}.Encode()

	resp, err := client.Get(reqURL)
	if err != nil {
		log.Error("[INSTAGRAM CRON] Gagal refresh token: %v", err)
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Error("[INSTAGRAM CRON] Gagal refresh token: %s", igErrorMessage(body))
		return
	}

	var parsed struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		ExpiresIn   int64  `json:"expires_in"`
	}
	if json.Unmarshal(body, &parsed) != nil {
		log.Error("[INSTAGRAM CRON] gagal parse response refresh token")
		return
	}

	newExpiredAt := time.Now().Add(time.Duration(parsed.ExpiresIn) * time.Second).UTC().Format(time.RFC3339)
	if err := SaveToken(parsed.AccessToken, parsed.TokenType, parsed.ExpiresIn, newExpiredAt); err != nil {
		log.Error("[INSTAGRAM CRON] gagal simpan token baru: %v", err)
		return
	}

	log.Info("[INSTAGRAM CRON] Token berhasil diperbarui | expired baru: %s", newExpiredAt)
}

// StartTokenCron: setara startInstagramTokenCron() di tokenRefresh.ts, jalan
// tiap hari jam 01:00 WIB. Go tidak punya library cron built-in sesimpel
// node-cron, jadi dipakai loop poll tiap 30 detik -- pola yang sama seperti
// cmd/cron-checkpushnotif, cukup akurat untuk kebutuhan "jalan 1x per hari".
func StartTokenCron(log *logger.Logger) {
	client := &http.Client{Timeout: 15 * time.Second, Transport: httpTransport}
	loc := jakarta()

	go func() {
		var lastRunDate string
		log.Info("[INSTAGRAM CRON] Scheduler aktif — cek token setiap hari pukul 01:00 WIB")

		for {
			now := time.Now().In(loc)
			today := now.Format("2006-01-02")

			if now.Hour() == 1 && now.Minute() == 0 && lastRunDate != today {
				refreshToken(log, client)
				lastRunDate = today
			}

			time.Sleep(30 * time.Second)
		}
	}()
}
