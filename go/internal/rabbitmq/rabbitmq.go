// Package rabbitmq menyediakan channel AMQP singleton dengan auto-reconnect,
// setara src/config/rabbit.ts.
package rabbitmq

import (
	"log"
	"os"
	"sync"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

// Nama queue -- harus SAMA PERSIS dengan yang dipakai project Node,
// supaya worker Go dan worker Node bisa saling konsumsi/produksi lewat
// RabbitMQ yang sama selama masa migrasi bertahap.
const (
	QUEUE          = "push_jobs"
	JAVA_QUEUE     = "push_jobs_javayoga"
	YAMAHA_QUEUE   = "push_jobs_yamaha"
	WELLNESS_QUEUE = "push_jobs_javawellness"
	LSA_QUEUE      = "push_jobs_lsa"
)

var (
	mu   sync.Mutex
	conn *amqp.Connection
	ch   *amqp.Channel
)

func rabbitURL() string {
	if v := os.Getenv("RABBIT_URL"); v != "" {
		return v
	}
	return "amqp://admin:suryatimur@localhost"
}

// GetChannel mengembalikan channel AMQP yang sudah connect. Kalau koneksi
// belum ada / sudah putus, akan connect ulang.
func GetChannel() (*amqp.Channel, error) {
	mu.Lock()
	defer mu.Unlock()
	return getChannelLocked()
}

func getChannelLocked() (*amqp.Channel, error) {
	if ch != nil {
		return ch, nil
	}

	c, err := amqp.DialConfig(rabbitURL(), amqp.Config{Heartbeat: 30 * time.Second})
	if err != nil {
		return nil, err
	}

	channel, err := c.Channel()
	if err != nil {
		c.Close()
		return nil, err
	}

	if _, err := channel.QueueDeclare(QUEUE, true, false, false, false, nil); err != nil {
		channel.Close()
		c.Close()
		return nil, err
	}

	conn = c
	ch = channel

	closeErr := make(chan *amqp.Error, 1)
	conn.NotifyClose(closeErr)
	go watchClose(closeErr)

	return ch, nil
}

func watchClose(closeErr chan *amqp.Error) {
	err := <-closeErr
	log.Printf("[RabbitMQ] koneksi tertutup -- mencoba reconnect... (%v)", err)

	mu.Lock()
	conn = nil
	ch = nil
	mu.Unlock()

	reconnectWithBackoff(1)
}

func reconnectWithBackoff(attempt int) {
	delay := time.Duration(1<<uint(attempt)) * time.Second
	if delay > 30*time.Second {
		delay = 30 * time.Second
	}
	log.Printf("[RabbitMQ] reconnect dalam %v (attempt %d)...", delay, attempt)
	time.Sleep(delay)

	mu.Lock()
	_, err := getChannelLocked()
	mu.Unlock()

	if err != nil {
		log.Printf("[RabbitMQ] reconnect gagal (attempt %d) | %v", attempt, err)
		reconnectWithBackoff(attempt + 1)
		return
	}
	log.Println("[RabbitMQ] reconnect berhasil")
}
