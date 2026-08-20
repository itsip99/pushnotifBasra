// cmd/worker-javayoga: setara pm2 "worker-javayoga" (dist/worker.javayoga.js)
package main

import (
	"log"
	"os"

	"hris-notif-go/internal/fcmauth"
	"hris-notif-go/internal/javayoga"
	"hris-notif-go/internal/logger"
)

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	cred := getenv("JAVAYOGA_FIREBASE_CREDENTIAL", "credentials/javayoga-f1963-firebase-adminsdk-lyt2d-9ebeeeacb7.json")

	lg := logger.New("javayoga-worker")
	tokens, err := fcmauth.NewTokenProvider(cred)
	if err != nil {
		log.Fatalf("gagal load kredensial JAVAYOGA (%s): %v", cred, err)
	}

	w := javayoga.NewWorker(tokens, lg)
	if err := w.Run(); err != nil {
		log.Fatalf("[JAVAYOGA] worker crash: %v", err)
	}
}
