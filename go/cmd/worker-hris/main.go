// cmd/worker-hris: setara pm2 "hris-worker" (dist/worker.hris.js)
package main

import (
	"log"
	"os"

	"hris-notif-go/internal/fcmauth"
	"hris-notif-go/internal/hris"
	"hris-notif-go/internal/logger"
)

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	cred := getenv("HRIS_FIREBASE_CREDENTIAL", "credentials/hris-mobile-flutter-bba9799773f1.json")

	lg := logger.New("hris-worker")
	tokens, err := fcmauth.NewTokenProvider(cred)
	if err != nil {
		log.Fatalf("gagal load kredensial HRIS (%s): %v", cred, err)
	}

	w := hris.NewWorker(tokens, lg)
	if err := w.Run(); err != nil {
		log.Fatalf("[HRIS] worker crash: %v", err)
	}
}
