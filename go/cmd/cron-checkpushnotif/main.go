// cmd/cron-checkpushnotif: setara dist/checkpushnotif.js
// Trigger API HRIS eksternal jam 08:00 WIB setiap hari untuk 3 employee ID.
//
// Catatan: Go tidak punya library cron built-in yang minimal seperti
// node-cron, jadi di sini dipakai loop sederhana yang cek waktu tiap menit
// -- cukup untuk kebutuhan "jalan sekali di jam tertentu tiap hari" tanpa
// nambah dependency external.
package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"
)

var employeeIDs = []string{
	"0305/000268",
	"2309/504253",
	"0907/001216",
}

const targetURL = "https://wsip.yamaha-jatim.co.id:2447/HRIS/Misc/CekPushNotif"

func jakarta() *time.Location {
	loc, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		return time.FixedZone("WIB", 7*3600)
	}
	return loc
}

func triggerAll(client *http.Client) {
	log.Println("Trigger API jam 08:00 WIB")

	for _, id := range employeeIDs {
		log.Printf("Kirim ke %s", id)

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		body, _ := json.Marshal(map[string]string{"employeeID": id})

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL, strings.NewReader(string(body)))
		if err != nil {
			log.Printf("Error %s: %v", id, err)
			cancel()
			continue
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := client.Do(req)
		cancel()
		if err != nil {
			log.Printf("Error %s: %v", id, err)
			continue
		}
		func() {
			defer resp.Body.Close()
			var parsed any
			_ = json.NewDecoder(resp.Body).Decode(&parsed)
			log.Printf("Success %s: %v", id, parsed)
		}()
	}

	log.Println("Selesai semua request")
}

func main() {
	client := &http.Client{}
	loc := jakarta()

	var lastRunDate string
	log.Println("Worker checkpushnotif running (08:00 WIB)")

	for {
		now := time.Now().In(loc)
		today := now.Format("2006-01-02")

		if now.Hour() == 8 && now.Minute() == 0 && lastRunDate != today {
			triggerAll(client)
			lastRunDate = today
		}

		time.Sleep(30 * time.Second)
	}
}
