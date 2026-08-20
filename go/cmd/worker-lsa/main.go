// cmd/worker-lsa: setara pm2 "lsa-worker" (dist/worker.lsa.js)
package main

import (
	"log"
	"os"

	"hris-notif-go/internal/fcmauth"
	"hris-notif-go/internal/logger"
	"hris-notif-go/internal/lsa"
)

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	cred := getenv("LSA_FIREBASE_CREDENTIAL", "credentials/lsamobile-firebase-adminsdk-fbsvc-ada2a5477d.json")

	lg := logger.New("lsa-worker")
	tokens, err := fcmauth.NewTokenProvider(cred)
	if err != nil {
		log.Fatalf("gagal load kredensial LSA (%s): %v", cred, err)
	}

	w := lsa.NewWorker(tokens, lg)
	if err := w.Run(); err != nil {
		log.Fatalf("[LSA] worker crash: %v", err)
	}
}
