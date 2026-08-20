// worker.go setara src/worker.lsa.ts
// Catatan: sama seperti versi Node-nya, worker ini TIDAK pakai delay-queue
// untuk retry (beda dari HRIS/Wellness) -- retry langsung requeue ke
// LSA_QUEUE yang sama dengan x-retry di-increment.
package lsa

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"

	"hris-notif-go/internal/fcmauth"
	"hris-notif-go/internal/logger"
	"hris-notif-go/internal/rabbitmq"
)

const workerFcmProjectID = "lsamobile"

const maxRetry = 3
const workerHTTPTimeout = 15 * time.Second

type lsaMessage struct {
	Token        string                 `json:"token"`
	Notification map[string]string      `json:"notification,omitempty"`
	Data         map[string]string      `json:"data,omitempty"`
	Android      map[string]interface{} `json:"android,omitempty"`
	APNS         map[string]interface{} `json:"apns,omitempty"`
}

type lsaJob struct {
	JobID     string     `json:"jobId,omitempty"`
	CreatedAt int64      `json:"createdAt,omitempty"`
	TtlMs     int64      `json:"ttlMs,omitempty"`
	Message   lsaMessage `json:"message"`
}

type Worker struct {
	tokens *fcmauth.TokenProvider
	log    *logger.Logger
	client *http.Client
}

func NewWorker(tokens *fcmauth.TokenProvider, log *logger.Logger) *Worker {
	return &Worker{tokens: tokens, log: log, client: &http.Client{Timeout: workerHTTPTimeout, Transport: fcmTransport}}
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

func isExpired(job lsaJob) bool {
	if job.CreatedAt == 0 || job.TtlMs == 0 {
		return false
	}
	return time.Now().UnixMilli() > job.CreatedAt+job.TtlMs
}

func isNonRetryable(msg string) bool {
	return strings.Contains(msg, "UNREGISTERED") ||
		strings.Contains(msg, "registration-token-not-registered") ||
		strings.Contains(msg, "Requested entity was not found")
}

func (w *Worker) sendToFCM(ctx context.Context, msg lsaMessage, token string) (int, []byte, error) {
	return postFCM(ctx, w.client, workerFcmProjectID, map[string]any{"message": msg}, token)
}

func (w *Worker) Run() error {
	ch, err := rabbitmq.GetChannel()
	if err != nil {
		return err
	}
	if err := ch.Qos(5, 0, false); err != nil {
		return err
	}
	if _, err := ch.QueueDeclare(rabbitmq.LSA_QUEUE, true, false, false, false, nil); err != nil {
		return err
	}

	consumerTag := fmt.Sprintf("lsa-%d", os.Getpid())
	msgs, err := ch.Consume(rabbitmq.LSA_QUEUE, consumerTag, false, false, false, false, nil)
	if err != nil {
		return err
	}

	w.log.Info("LSA worker ready. Queue: %s", rabbitmq.LSA_QUEUE)

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

	var job lsaJob
	if err := json.Unmarshal(d.Body, &job); err != nil {
		w.log.Error("[LSA] invalid JSON -> ack drop")
		_ = d.Ack(false)
		return
	}

	if isExpired(job) {
		w.log.Error("[LSA] expired job -> ack drop token=%s", job.Message.Token)
		_ = d.Ack(false)
		return
	}

	ctx := context.Background()
	token, err := w.tokens.AccessToken(ctx)
	if err != nil {
		w.log.Error("[LSA] gagal ambil access token: %v", err)
		_ = d.Nack(false, true)
		return
	}

	status, respBody, sendErr := w.sendToFCM(ctx, job.Message, token)
	if sendErr == nil && status >= 200 && status < 300 {
		w.log.Info("LSA | Success | %s", job.Message.Token)
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
				w.log.Info("LSA | Success (after token refresh) | %s", job.Message.Token)
				_ = d.Ack(false)
				return
			}
			if sendErr2 == nil {
				status = status2
				message = fcmErrorMessage(respBody2)
			}
		}
	}

	w.log.Error("[LSA] fail status=%d retry=%d token=%s msg=%s", status, retry, job.Message.Token, message)

	if status == 404 || isNonRetryable(message) {
		_ = d.Ack(false)
		return
	}

	if retry < maxRetry {
		newHeaders := amqp.Table{}
		for k, v := range headers {
			newHeaders[k] = v
		}
		newHeaders["x-retry"] = int32(retry + 1)

		pubErr := ch.Publish("", rabbitmq.LSA_QUEUE, false, false, amqp.Publishing{
			ContentType:  d.ContentType,
			Body:         d.Body,
			DeliveryMode: amqp.Persistent,
			Timestamp:    d.Timestamp,
			Expiration:   d.Expiration,
			Headers:      newHeaders,
		})
		if pubErr != nil {
			w.log.Error("[LSA] buffer full -> NACK requeue")
			_ = d.Nack(false, true)
			return
		}
		_ = d.Ack(false)
		return
	}

	_ = d.Ack(false)
}
