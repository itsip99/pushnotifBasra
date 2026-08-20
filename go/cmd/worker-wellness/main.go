// cmd/worker-wellness: setara pm2 "wellness-worker" (dist/worker.javawellness.js)
package main

import (
	"log"
	"os"

	"hris-notif-go/internal/fcmauth"
	"hris-notif-go/internal/logger"
	"hris-notif-go/internal/wellness"
)

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	cred := getenv("WELLNESS_FIREBASE_CREDENTIAL", "credentials/javawellness-3c6ad-firebase-adminsdk-fbsvc-e32ce697c8.json")

	lg := logger.New("wellness-worker")
	tokens, err := fcmauth.NewTokenProvider(cred)
	if err != nil {
		log.Fatalf("gagal load kredensial Wellness (%s): %v", cred, err)
	}

	w := wellness.NewWorker(tokens, lg)
	if err := w.Run(); err != nil {
		log.Fatalf("[WELLNESS] worker crash: %v", err)
	}
}
