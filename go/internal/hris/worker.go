// worker.go setara src/worker.hris.ts
package hris

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"

	"hris-notif-go/internal/fcmauth"
	"hris-notif-go/internal/logger"
	"hris-notif-go/internal/rabbitmq"
)

var retryDelaysMs = []int{5000, 15000, 30000}

const maxRetry = 3

type Worker struct {
	tokens *fcmauth.TokenProvider
	log    *logger.Logger
	h      *Handler // reuse sendNotificationFcm/fcmErrorMessage
}

func NewWorker(tokens *fcmauth.TokenProvider, log *logger.Logger) *Worker {
	return &Worker{tokens: tokens, log: log, h: NewHandler(tokens, log)}
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
	raw, ok := headers["x-flow"]
	if !ok {
		return nil
	}
	s, ok := raw.(string)
	if !ok || s == "" {
		return nil
	}
	return strings.Split(s, "|")
}

func joinFlow(flow []string) string {
	return strings.Join(flow, "|")
}

func isExpired(job NotificationJob) bool {
	if job.CreatedAt == 0 || job.TtlMs == 0 {
		return false
	}
	return time.Now().UnixMilli() > job.CreatedAt+job.TtlMs
}

func canRetry(job NotificationJob, attempt int) bool {
	delay := 30000
	if attempt < len(retryDelaysMs) {
		delay = retryDelaysMs[attempt]
	}
	needed := int64(delay + 10000)
	if job.CreatedAt == 0 || job.TtlMs == 0 {
		return true
	}
	remaining := job.CreatedAt + job.TtlMs - time.Now().UnixMilli()
	return remaining > needed
}

func isNonRetryable(msg string) bool {
	return strings.Contains(msg, "UNREGISTERED") ||
		strings.Contains(msg, "registration-token-not-registered") ||
		strings.Contains(msg, "Requested entity was not found")
}

func (w *Worker) logBlock(level string, jobID, userID, jenis string, retry int, flow []string, status *int, message string, meta map[string]interface{}) {
	metaJSON := "-"
	if meta != nil {
		if b, err := json.Marshal(meta); err == nil {
			metaJSON = string(b)
		}
	}
	lines := []string{
		"========== HIRS WORKER ==========",
		fmt.Sprintf("jobId : %s", jobID),
		fmt.Sprintf("user  : %s", userID),
		fmt.Sprintf("jenis : %s", jenis),
		fmt.Sprintf("retry : %d", retry),
	}
	if status != nil {
		lines = append(lines, fmt.Sprintf("http  : %d", *status))
	}
	lines = append(lines, fmt.Sprintf("flow  : %s", strings.Join(flow, " -> ")))
	lines = append(lines, fmt.Sprintf("meta  : %s", metaJSON))
	if message != "" {
		lines = append(lines, fmt.Sprintf("error : %s", message))
	}
	lines = append(lines, "=================================")
	text := strings.Join(lines, "\n")

	if level == "error" {
		w.log.Error("%s", text)
	} else {
		w.log.Info("%s", text)
	}
}

// pushYamahaCallback setara pushYamahaCallback() di worker.hris.ts.
// Job dipush ke YAMAHA_QUEUE dengan format yang sama persis supaya
// worker-yamaha (masih Node, belum dimigrasi) tetap bisa konsumsi.
func (w *Worker) pushYamahaCallback(ch *amqp.Channel, job NotificationJob) {
	numerator := metaString(job.MetaData, "Numerator")
	pt := metaString(job.MetaData, "PT")
	jenis := metaString(job.MetaData, "Jenis")

	if numerator == "" || pt == "" || jenis == "" {
		w.log.Error("LPUSHNOTIF skip — field wajib kosong | jobId=%s | Numerator=%s | PT=%s | Jenis=%s", job.JobID, numerator, pt, jenis)
		return
	}

	yamahaJob := map[string]any{
		"jobId":     job.JobID,
		"createdAt": time.Now().UnixMilli(),
		"ttlMs":     24 * 60 * 60 * 1000,
		"Jenis":     jenis,
		"PT":        pt,
		"Numerator": numerator,
	}
	body, _ := json.Marshal(yamahaJob)

	err := ch.Publish("", rabbitmq.YAMAHA_QUEUE, false, false, amqp.Publishing{
		DeliveryMode: amqp.Persistent,
		Body:         body,
		Headers: amqp.Table{
			"x-retry":  int32(0),
			"x-job-id": job.JobID,
		},
	})
	if err != nil {
		w.log.Error("LPUSHNOTIF gagal masuk queue | jobId=%s | Numerator=%s | err=%v", job.JobID, numerator, err)
		return
	}
	w.log.Info("LPUSHNOTIF job masuk queue | jobId=%s | Numerator=%s | PT=%s | Jenis=%s", job.JobID, numerator, pt, jenis)
}

func (w *Worker) Run() error {
	ch, err := rabbitmq.GetChannel()
	if err != nil {
		return err
	}
	if err := ch.Qos(20, 0, false); err != nil {
		return err
	}
	if _, err := ch.QueueDeclare(rabbitmq.YAMAHA_QUEUE, true, false, false, false, nil); err != nil {
		return err
	}

	for _, delay := range retryDelaysMs {
		name := fmt.Sprintf("%s_delay_%dms", rabbitmq.QUEUE, delay)
		_, err := ch.QueueDeclare(name, true, false, false, false, amqp.Table{
			"x-message-ttl":             int32(delay),
			"x-dead-letter-exchange":    "",
			"x-dead-letter-routing-key": rabbitmq.QUEUE,
		})
		if err != nil {
			return err
		}
	}

	consumerTag := fmt.Sprintf("worker-hris-%d", os.Getpid())
	msgs, err := ch.Consume(rabbitmq.QUEUE, consumerTag, false, false, false, false, nil)
	if err != nil {
		return err
	}

	w.log.Info("[HRIS WORKER] listening: %s", rabbitmq.QUEUE)

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

	var job NotificationJob
	if err := json.Unmarshal(d.Body, &job); err != nil {
		w.log.Error("HIRS_WORKER | INVALID_JSON | ack-drop")
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
	jenis := metaString(job.MetaData, "jenis")
	if jenis == "" {
		jenis = "-"
	}

	flow := parseFlow(headers)
	if len(flow) == 0 {
		flow = []string{"PROCESS"}
	}

	if isExpired(job) {
		flow = append(flow, "EXPIRED")
		w.logBlock("info", jobID, userID, jenis, retry, flow, nil, "", job.MetaData)
		_ = d.Ack(false)
		return
	}

	ctx := context.Background()

	token, err := w.tokens.AccessToken(ctx)
	if err != nil {
		w.log.Error("[HIRS] gagal ambil access token: %v", err)
		_ = d.Nack(false, true)
		return
	}

	status, respBody, sendErr := w.h.sendNotificationFcm(ctx, map[string]any{"message": job.Message}, token)
	if sendErr == nil && status >= 200 && status < 300 {
		flow = append(flow, "SENT")
		w.logBlock("info", jobID, userID, jenis, retry, flow, nil, "", job.MetaData)
		w.pushYamahaCallback(ch, job)
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

	// 401 -> force refresh token sekali, coba kirim lagi
	if status == 401 {
		if newToken, refreshErr := w.tokens.ForceRefresh(ctx); refreshErr == nil {
			status2, respBody2, sendErr2 := w.h.sendNotificationFcm(ctx, map[string]any{"message": job.Message}, newToken)
			if sendErr2 == nil && status2 >= 200 && status2 < 300 {
				flow = append(flow, "SENT")
				w.logBlock("info", jobID, userID, jenis, retry, flow, &status, "", job.MetaData)
				w.pushYamahaCallback(ch, job)
				_ = d.Ack(false)
				return
			}
			if sendErr2 == nil {
				status = status2
				message = fcmErrorMessage(respBody2)
			}
		}
	}

	// device token tidak valid -> buang, tidak ada gunanya retry
	if status == 404 || isNonRetryable(message) {
		flow = append(flow, "INVALID_TOKEN")
		w.logBlock("info", jobID, userID, jenis, retry, flow, &status, message, job.MetaData)
		if job.Message.Token != "" {
			w.log.Error("[HIRS] token invalid | token=%s | userId=%s | perlu dihapus dari DB", job.Message.Token, userID)
		}
		_ = d.Ack(false)
		return
	}

	// error lain -> retry lewat delay queue
	if retry < maxRetry && canRetry(job, retry) {
		delayIdx := retry
		if delayIdx >= len(retryDelaysMs) {
			delayIdx = len(retryDelaysMs) - 1
		}
		delay := retryDelaysMs[delayIdx]
		flow = append(flow, "RETRY")
		w.logBlock("error", jobID, userID, jenis, retry, flow, &status, fmt.Sprintf("%s — retry dalam %ds", message, delay/1000), job.MetaData)

		newHeaders := amqp.Table{}
		for k, v := range headers {
			newHeaders[k] = v
		}
		newHeaders["x-retry"] = int32(retry + 1)
		newHeaders["x-flow"] = joinFlow(flow)

		queueName := fmt.Sprintf("%s_delay_%dms", rabbitmq.QUEUE, delay)
		pubErr := ch.Publish("", queueName, false, false, amqp.Publishing{
			ContentType:  d.ContentType,
			Body:         d.Body,
			DeliveryMode: amqp.Persistent,
			Timestamp:    d.Timestamp,
			Expiration:   d.Expiration,
			Headers:      newHeaders,
		})
		if pubErr != nil {
			w.logBlock("error", jobID, userID, jenis, retry, flow, &status, "buffer full -> NACK requeue", job.MetaData)
			_ = d.Nack(false, true)
			return
		}
		_ = d.Ack(false)
		return
	}

	// retry habis / TTL tidak cukup
	flow = append(flow, "FAILED")
	w.logBlock("error", jobID, userID, jenis, retry, flow, &status, message, job.MetaData)
	_ = d.Ack(false)
}
