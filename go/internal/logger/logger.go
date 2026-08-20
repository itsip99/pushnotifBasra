// Package logger meniru perilaku src/logger/logger.ts (winston):
// - timestamp Asia/Jakarta
// - info & error dipisah ke file berbeda
// - file rotate per hari (nama file mengandung tanggal)
//
// Catatan: pembersihan file lama otomatis (setara maxFiles:'14d' di Node)
// TIDAK diimplementasikan di sini — kalau perlu, tambahkan cron/logrotate
// terpisah di server untuk hapus file logs/*.log yang lebih tua dari 14 hari.
package logger

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// flushInterval: seberapa sering buffer dipaksa tertulis ke disk walau belum
// penuh. Trade-off sadar: kalau proses crash di antara flush, baris log
// dalam window ini bisa hilang -- diterima demi lepas dari 1 syscall disk
// write per baris log yang sebelumnya nge-block semua goroutine (semua
// logging lewat mutex yang sama, jadi worker konkuren ikut antre nunggu I/O).
const flushInterval = 500 * time.Millisecond

type Logger struct {
	name       string
	mu         sync.Mutex
	day        string
	infoFile   *os.File
	errFile    *os.File
	infoWriter *bufio.Writer
	errWriter  *bufio.Writer
	stopFlush  chan struct{}
}

func jakarta() *time.Location {
	loc, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		return time.FixedZone("WIB", 7*3600)
	}
	return loc
}

// New membuat logger baru. name dipakai sebagai prefix nama file, mis. "hris" -> logs/hris-info-2026-08-10.log
func New(name string) *Logger {
	_ = os.MkdirAll("logs", 0755)
	l := &Logger{name: name, stopFlush: make(chan struct{})}
	l.rotateIfNeeded()
	go l.flushLoop()
	return l
}

// flushLoop mengosongkan buffer ke disk tiap flushInterval, di luar jalur
// Info()/Error() -- supaya goroutine yang logging tidak pernah nunggu syscall
// disk write, cuma nulis ke memory buffer (cepat).
func (l *Logger) flushLoop() {
	ticker := time.NewTicker(flushInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			l.mu.Lock()
			if l.infoWriter != nil {
				l.infoWriter.Flush()
			}
			if l.errWriter != nil {
				l.errWriter.Flush()
			}
			l.mu.Unlock()
		case <-l.stopFlush:
			return
		}
	}
}

func (l *Logger) rotateIfNeeded() {
	today := time.Now().In(jakarta()).Format("2006-01-02")
	if l.day == today {
		return
	}
	l.day = today

	if l.infoWriter != nil {
		l.infoWriter.Flush()
	}
	if l.errWriter != nil {
		l.errWriter.Flush()
	}
	if l.infoFile != nil {
		l.infoFile.Close()
	}
	if l.errFile != nil {
		l.errFile.Close()
	}

	infoPath := filepath.Join("logs", fmt.Sprintf("%s-info-%s.log", l.name, today))
	errPath := filepath.Join("logs", fmt.Sprintf("%s-error-%s.log", l.name, today))

	if f, err := os.OpenFile(infoPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil {
		l.infoFile = f
		l.infoWriter = bufio.NewWriter(f)
	}
	if f, err := os.OpenFile(errPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil {
		l.errFile = f
		l.errWriter = bufio.NewWriter(f)
	}
}

func (l *Logger) timestamp() string {
	return time.Now().In(jakarta()).Format("2006-01-02 15:04")
}

func (l *Logger) Info(format string, args ...any) {
	// fmt.Sprintf di luar lock -- format string bisa lumayan berat (JSON
	// marshal meta, dst di caller), tidak perlu ikut nahan goroutine lain.
	line := fmt.Sprintf("%s info: %s\n", l.timestamp(), fmt.Sprintf(format, args...))

	l.mu.Lock()
	defer l.mu.Unlock()
	l.rotateIfNeeded()
	fmt.Print(line)
	if l.infoWriter != nil {
		l.infoWriter.WriteString(line) // ke memory buffer, bukan langsung disk -- lihat flushLoop
	}
}

func (l *Logger) Error(format string, args ...any) {
	line := fmt.Sprintf("%s error: %s\n", l.timestamp(), fmt.Sprintf(format, args...))

	l.mu.Lock()
	defer l.mu.Unlock()
	l.rotateIfNeeded()
	fmt.Fprint(os.Stderr, line)
	if l.errWriter != nil {
		l.errWriter.WriteString(line)
	}
}
