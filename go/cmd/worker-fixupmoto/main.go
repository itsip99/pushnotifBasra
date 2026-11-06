// cmd/worker-fixupmoto: setara pm2 "worker-fixupmoto" (dist/worker.fixupmoto.js)
package main

import (
	"log"
	"os"

	"hris-notif-go/internal/fcmauth"
	"hris-notif-go/internal/fixupmoto"
	"hris-notif-go/internal/logger"
)

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	cred := getenv("FIXUPMOTO_FIREBASE_CREDENTIAL", "credentials/fixupmoto-service-account.json")

	lg := logger.New("fixupmoto-worker")
	tokens, err := fcmauth.NewTokenProvider(cred)
	if err != nil {
		log.Fatalf("gagal load kredensial FIXUPMOTO (%s): %v", cred, err)
	}

	w := fixupmoto.NewWorker(tokens, lg)
	if err := w.Run(); err != nil {
		log.Fatalf("[FIXUPMOTO] worker crash: %v", err)
	}
}
