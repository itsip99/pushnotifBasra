// Package wellness setara src/worker.javawellness.ts.
// Tidak ada HTTP endpoint di modul ini (sama seperti versi Node) -- job
// device-token dikirim langsung ke RabbitMQ oleh modul lain (mis. LSA/HRIS
// versi lama) atau caller eksternal yang publish langsung ke queue.
package wellness

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"

	"hris-notif-go/internal/fcmauth"
	"hris-notif-go/internal/logger"
	"hris-notif-go/internal/rabbitmq"
)

const fcmURL = "https://fcm.googleapis.com/v1/projects/javawellness-3c6ad/messages:send"
const httpTimeout = 15 * time.Second
const maxRetry = 3

var retryDelaysMs = []int{5000, 15000, 30000}

// fcmTransport: reuse koneksi ke fcm.googleapis.com, lihat catatan di internal/hris/handler.go.
var fcmTransport = &http.Transport{
	MaxIdleConns:        100,
	MaxIdleConnsPerHost: 50,
	IdleConnTimeout:     90 * time.Second,
}

type NotificationPayload struct {
	Token        string                 `json:"token"`
	Notification map[string]string      `json:"notification,omitempty"`
	Data         map[string]string      `json:"data,omitempty"`
	Android      map[string]interface{} `json:"android,omitempty"`
	APNS         map[string]interface{} `json:"apns,omitempty"`
}

type WellnessJob struct {
	JobID     string                 `json:"jobId"`
	CreatedAt int64                  `json:"createdAt"`
	TtlMs     int64                  `json:"ttlMs"`
	MetaData  map[string]interface{} `json:"metaData,omitempty"`
	Message   NotificationPayload    `json:"message"`
}

type Worker struct {
	tokens *fcmauth.TokenProvider
	log    *logger.Logger
	client *http.Client
}

func NewWorker(tokens *fcmauth.TokenProvider, log *logger.Logger) *Worker {
	return &Worker{tokens: tokens, log: log, client: &http.Client{Timeout: httpTimeout, Transport: fcmTransport}}
}

func metaString(meta map[string]interface{}, key string) string {
	if meta == nil {
		return ""
	}
	if v, ok := meta[key].(string); ok {
		return v
	}
	return ""
}

func toInt(v interface{}) int {
	switch n := v.(type) {
	case int32:
		return int(n)
	case int64:
		return int(n)
	case int:
		return n
	case float64:
		return int(n)
	default:
		return 0
	}
}

func parseFlow(headers amqp.Table) []string {
	raw, ok := headers["x-flow"].(string)
	if !ok || raw == "" {
		return nil
	}
	return strings.Split(raw, "|")
}

func isExpired(job WellnessJob) bool {
	if job.CreatedAt == 0 || job.TtlMs == 0 {
		return false
	}
	return time.Now().UnixMilli() > job.CreatedAt+job.TtlMs
}

func canRetry(job WellnessJob, attempt int) bool {
	delay := 30000
	if attempt < len(retryDelaysMs) {
		delay = retryDelaysMs[attempt]
	}
	if job.CreatedAt == 0 || job.TtlMs == 0 {
		return true
	}
	remaining := job.CreatedAt + job.TtlMs - time.Now().UnixMilli()
	return remaining > int64(delay+10000)
}

func isNonRetryable(msg string) bool {
	return strings.Contains(msg, "UNREGISTERED") ||
		strings.Contains(msg, "registration-token-not-registered") ||
		strings.Contains(msg, "Requested entity was not found")
}

func fcmErrorMessage(body []byte) string {
	var parsed struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal(body, &parsed) == nil && parsed.Error.Message != "" {
		return parsed.Error.Message
	}
	return string(body)
}

func (w *Worker) sendToFCM(ctx context.Context, msg NotificationPayload, token string) (int, []byte, error) {
	buf, _ := json.Marshal(map[string]any{"message": msg})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fcmURL, bytes.NewReader(buf))
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := w.client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, body, nil
}

func (w *Worker) logBlock(level string, jobID, userID string, retry int, flow []string, status *int, message string) {
	lines := []string{
		"========== WELLNESS WORKER ==========",
		fmt.Sprintf("jobId  : %s", jobID),
		fmt.Sprintf("user   : %s", userID),
		fmt.Sprintf("retry  : %d", retry),
	}
	if status != nil {
		lines = append(lines, fmt.Sprintf("http   : %d", *status))
	}
	lines = append(lines, fmt.Sprintf("flow   : %s", strings.Join(flow, " -> ")))
	if message != "" {
		lines = append(lines, fmt.Sprintf("error  : %s", message))
	}
	lines = append(lines, "=====================================")
	text := strings.Join(lines, "\n")

	if level == "error" {
		w.log.Error("%s", text)
	} else {
		w.log.Info("%s", text)
	}
}

func (w *Worker) Run() error {
	ch, err := rabbitmq.GetChannel()
	if err != nil {
		return err
	}
	if err := ch.Qos(10, 0, false); err != nil {
		return err
	}
	if _, err := ch.QueueDeclare(rabbitmq.WELLNESS_QUEUE, true, false, false, false, nil); err != nil {
		return err
	}

	for _, delay := range retryDelaysMs {
		name := fmt.Sprintf("%s_delay_%dms", rabbitmq.WELLNESS_QUEUE, delay)
		_, err := ch.QueueDeclare(name, true, false, false, false, amqp.Table{
			"x-message-ttl":             int32(delay),
			"x-dead-letter-exchange":    "",
			"x-dead-letter-routing-key": rabbitmq.WELLNESS_QUEUE,
		})
		if err != nil {
			return err
		}
	}

	consumerTag := fmt.Sprintf("wellness-%d", os.Getpid())
	msgs, err := ch.Consume(rabbitmq.WELLNESS_QUEUE, consumerTag, false, false, false, false, nil)
	if err != nil {
		return err
	}

	w.log.Info("[WELLNESS WORKER] listening: %s", rabbitmq.WELLNESS_QUEUE)

	for d := range msgs {
		w.handle(ch, d)
	}
	return nil
}

func (w *Worker) handle(ch *amqp.Channel, d amqp.Delivery) {
	headers := d.Headers
	if headers == nil {
		headers = amqp.Table{}
	}
	retry := toInt(headers["x-retry"])

	var job WellnessJob
	if err := json.Unmarshal(d.Body, &job); err != nil {
		w.log.Error("WELLNESS_WORKER | INVALID_JSON | ack-drop")
		_ = d.Ack(false)
		return
	}

	jobID := job.JobID
	if jobID == "" {
		jobID = fmt.Sprint(headers["x-job-id"])
	}
	userID := metaString(job.MetaData, "userid")
	if userID == "" {
		userID = "-"
	}

	flow := parseFlow(headers)
	if len(flow) == 0 {
		flow = []string{"PROCESS"}
	}

	if isExpired(job) {
		flow = append(flow, "EXPIRED")
		w.logBlock("info", jobID, userID, retry, flow, nil, "")
		_ = d.Ack(false)
		return
	}

	ctx := context.Background()
	token, err := w.tokens.AccessToken(ctx)
	if err != nil {
		w.log.Error("[WELLNESS] gagal ambil access token: %v", err)
		_ = d.Nack(false, true)
		return
	}

	status, respBody, sendErr := w.sendToFCM(ctx, job.Message, token)
	if sendErr == nil && status >= 200 && status < 300 {
		flow = append(flow, "SENT")
		w.logBlock("info", jobID, userID, retry, flow, nil, "")
		_ = d.Ack(false)
		return
	}

	message := "Unknown"
	if sendErr != nil {
		message = sendErr.Error()
		status = 0
	} else {
		message = fcmErrorMessage(respBody)
	}

	if status == 401 {
		if newToken, refreshErr := w.tokens.ForceRefresh(ctx); refreshErr == nil {
			status2, respBody2, sendErr2 := w.sendToFCM(ctx, job.Message, newToken)
			if sendErr2 == nil && status2 >= 200 && status2 < 300 {
				flow = append(flow, "SENT")
				w.logBlock("info", jobID, userID, retry, flow, &status, "")
				_ = d.Ack(false)
				return
			}
			if sendErr2 == nil {
				status = status2
				message = fcmErrorMessage(respBody2)
			}
		}
	}

	if status == 404 || isNonRetryable(message) {
		flow = append(flow, "INVALID_TOKEN")
		w.logBlock("info", jobID, userID, retry, flow, &status, message)
		_ = d.Ack(false)
		return
	}

	if retry < maxRetry && canRetry(job, retry) {
		delayIdx := retry
		if delayIdx >= len(retryDelaysMs) {
			delayIdx = len(retryDelaysMs) - 1
		}
		delay := retryDelaysMs[delayIdx]
		flow = append(flow, "RETRY")
		w.logBlock("error", jobID, userID, retry, flow, &status, fmt.Sprintf("%s — retry dalam %ds", message, delay/1000))

		newHeaders := amqp.Table{}
		for k, v := range headers {
			newHeaders[k] = v
		}
		newHeaders["x-retry"] = int32(retry + 1)
		newHeaders["x-flow"] = strings.Join(flow, "|")

		queueName := fmt.Sprintf("%s_delay_%dms", rabbitmq.WELLNESS_QUEUE, delay)
		pubErr := ch.Publish("", queueName, false, false, amqp.Publishing{
			ContentType:  d.ContentType,
			Body:         d.Body,
			DeliveryMode: amqp.Persistent,
			Timestamp:    d.Timestamp,
			Expiration:   d.Expiration,
			Headers:      newHeaders,
		})
		if pubErr != nil {
			w.logBlock("error", jobID, userID, retry, flow, &status, "buffer full -> NACK requeue")
			_ = d.Nack(false, true)
			return
		}
		_ = d.Ack(false)
		return
	}

	flow = append(flow, "FAILED")
	w.logBlock("error", jobID, userID, retry, flow, &status, message)
	_ = d.Ack(false)
}
