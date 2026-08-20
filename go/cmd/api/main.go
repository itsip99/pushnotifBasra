// cmd/api: HTTP server setara src/index.ts, tapi HANYA untuk modul yang
// sudah dimigrasi ke Go (HRIS, LSA, Wellness, BasraMobile, FixupMoto,
// JavaYoga, Instagram). joinBasra belum dimigrasi -- tetap dilayani API
// Node (service-notif) selama itu.
package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"hris-notif-go/internal/basramobile"
	"hris-notif-go/internal/fcmauth"
	"hris-notif-go/internal/fixupmoto"
	"hris-notif-go/internal/hris"
	"hris-notif-go/internal/instagram"
	"hris-notif-go/internal/javayoga"
	"hris-notif-go/internal/logger"
	"hris-notif-go/internal/lsa"
	"hris-notif-go/internal/wellness"
)

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	port := getenv("PORT_GO", "5001")

	hrisCred := getenv("HRIS_FIREBASE_CREDENTIAL", "credentials/hris-mobile-flutter-bba9799773f1.json")
	lsaCred := getenv("LSA_FIREBASE_CREDENTIAL", "credentials/lsamobile-firebase-adminsdk-fbsvc-ada2a5477d.json")
	wellnessCred := getenv("WELLNESS_FIREBASE_CREDENTIAL", "credentials/javawellness-3c6ad-firebase-adminsdk-fbsvc-e32ce697c8.json")
	basraMobileCred := getenv("BASRAMOBILE_FIREBASE_CREDENTIAL", "credentials/basra-mobile-86f72-firebase-adminsdk-3nbag-ca009489f4.json")
	fixupMotoCred := getenv("FIXUPMOTO_FIREBASE_CREDENTIAL", "credentials/fixupmoto-service-account.json")
	javaYogaCred := getenv("JAVAYOGA_FIREBASE_CREDENTIAL", "credentials/javayoga-f1963-firebase-adminsdk-lyt2d-9ebeeeacb7.json")

	hrisLog := logger.New("hris-api")
	hrisTokens, err := fcmauth.NewTokenProvider(hrisCred)
	if err != nil {
		log.Fatalf("gagal load kredensial HRIS (%s): %v", hrisCred, err)
	}
	hrisHandler := hris.NewHandler(hrisTokens, hrisLog)

	lsaLog := logger.New("lsa-api")
	lsaTokens, err := fcmauth.NewTokenProvider(lsaCred)
	if err != nil {
		log.Fatalf("gagal load kredensial LSA (%s): %v", lsaCred, err)
	}
	lsaHandler := lsa.NewHandler(lsaTokens, lsaLog)

	wellnessLog := logger.New("wellness-api")
	wellnessTokens, err := fcmauth.NewTokenProvider(wellnessCred)
	if err != nil {
		log.Fatalf("gagal load kredensial WELLNESS (%s): %v", wellnessCred, err)
	}
	wellnessHandler := wellness.NewHandler(wellnessTokens, wellnessLog)

	basraMobileLog := logger.New("basramobile-api")
	basraMobileTokens, err := fcmauth.NewTokenProvider(basraMobileCred)
	if err != nil {
		log.Fatalf("gagal load kredensial BASRAMOBILE (%s): %v", basraMobileCred, err)
	}
	basraMobileHandler := basramobile.NewHandler(basraMobileTokens, basraMobileLog)

	fixupMotoLog := logger.New("fixupmoto-api")
	fixupMotoTokens, err := fcmauth.NewTokenProvider(fixupMotoCred)
	if err != nil {
		log.Fatalf("gagal load kredensial FIXUPMOTO (%s): %v", fixupMotoCred, err)
	}
	fixupMotoHandler := fixupmoto.NewHandler(fixupMotoTokens, fixupMotoLog)

	javaYogaLog := logger.New("javayoga-api")
	javaYogaTokens, err := fcmauth.NewTokenProvider(javaYogaCred)
	if err != nil {
		log.Fatalf("gagal load kredensial JAVAYOGA (%s): %v", javaYogaCred, err)
	}
	javaYogaHandler := javayoga.NewHandler(javaYogaTokens, javaYogaLog)

	instagramLog := logger.New("instagram-api")
	instagramHandler := instagram.NewHandler(instagramLog)
	instagram.StartTokenCron(instagramLog)

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})
	hrisHandler.RegisterRoutes(mux)
	lsaHandler.RegisterRoutes(mux)
	wellnessHandler.RegisterRoutes(mux)
	basraMobileHandler.RegisterRoutes(mux)
	fixupMotoHandler.RegisterRoutes(mux)
	javaYogaHandler.RegisterRoutes(mux)
	instagramHandler.RegisterRoutes(mux)

	log.Printf("Go API server running at http://localhost:%s (routes: /HRIS/*, /LSA/*, /WELLNESS/*, /BASRAMOBILE/*, /FIXUPMOTO/*, /JAVAYOGA/*, /instagram/*)", port)

	// Timeout eksplisit -- http.ListenAndServe polos pakai http.Server{} default
	// yang TIDAK punya timeout sama sekali. Tanpa ini, koneksi client yang lambat
	// atau nyantol (misal jaringan mobile app jelek) bisa numpuk dan makan file
	// descriptor server tanpa batas waktu (rawan slow-loris juga).
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 20 * time.Second, // sedikit lebih longgar dari httpTimeout ke FCM (15s) supaya sempat balas error
		IdleTimeout:  60 * time.Second,
	}
	log.Fatal(srv.ListenAndServe())
}
