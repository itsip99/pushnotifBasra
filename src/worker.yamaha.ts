import axios from "axios";
import { ConsumeMessage } from "amqplib";
import { getChannel, YAMAHA_QUEUE } from "./config/rabbit";
import { logger, loggerSuccess } from "./logger/logger";

const YAMAHA_URL = "https://wsip.yamaha-jatim.co.id:2447/HRIS/Misc/ModifyLPushNotif";
const MAX_RETRY = 10;
const RETRY_DELAYS_MS = [5_000, 10_000, 15_000, 30_000, 60_000]; // max 60 detik per attempt

// ─── ALUR KESELURUHAN ────────────────────────────────────────────────────────
//
//  [worker.hris setelah notif SENT]
//       │
//       ▼
//  [push_jobs_yamaha]  ←───────────────────────────────────────────────┐
//       │                                                               │
//       ▼                                                               │ (setelah TTL habis,
//  worker ambil pesan                                                  │  RabbitMQ otomatis
//       │                                                               │  pindahkan pesan
//       ├─ JSON rusak          → ack, buang                            │  ke push_jobs_yamaha)
//       ├─ field wajib kosong  → SKIP, ack, buang                      │
//       ├─ TTL habis           → EXPIRED, ack, buang                   │
//       │                                                               │
//       ▼                                                               │
//  hit Yamaha API                                                       │
//       │                                                               │
//       ├─ resultMessage SUKSES → SUKSES, ack                          │
//       │                                                               │
//       └─ gagal / bukan SUKSES                                        │
//            │                                                          │
//            ├─ retry < 10 & TTL cukup → kirim ke delay queue ─────────┘
//            │                           push_jobs_yamaha_delay_5000ms  (attempt 0)
//            │                           push_jobs_yamaha_delay_10000ms (attempt 1)
//            │                           push_jobs_yamaha_delay_15000ms (attempt 2)
//            │                           push_jobs_yamaha_delay_30000ms (attempt 3)
//            │                           push_jobs_yamaha_delay_60000ms (attempt 4+)
//            │                           ack, slot prefetch langsung bebas
//            │
//            └─ retry >= 10 atau TTL tidak cukup → FAILED, ack, buang
//                                                  (pesan mati di sini)
//
// ─────────────────────────────────────────────────────────────────────────────

type YamahaJob = {
  jobId?: string;
  createdAt?: number;
  ttlMs?: number;
  Jenis: string;
  PT: string;
  Numerator: string;
};

function parseJob(buf: Buffer): YamahaJob | null {
  try {
    return JSON.parse(buf.toString()) as YamahaJob;
  } catch {
    return null;
  }
}

function expired(job: YamahaJob): boolean {
  if (!job.createdAt || !job.ttlMs) return false;
  return Date.now() > job.createdAt + job.ttlMs;
}

function getDelay(attempt: number): number {
  return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
}

function canRetry(job: YamahaJob, attempt: number): boolean {
  if (!job.createdAt || !job.ttlMs) return true; // kalau tidak ada TTL, selalu retry
  const delay = getDelay(attempt);
  const remaining = job.createdAt + job.ttlMs - Date.now();
  return remaining > delay + 10_000;
}

function logBlock(level: "info" | "error", payload: {
  jobId: string;
  numerator: string;
  pt: string;
  jenis: string;
  retry: number;
  flow: string[];
  response?: string;
  error?: string;
}) {
  const header = "========== LPUSHNOTIF ==========";
  const footer = "================================";
  const body = [
    `jobId     : ${payload.jobId}`,
    `Numerator : ${payload.numerator}`,
    `PT        : ${payload.pt}`,
    `Jenis     : ${payload.jenis}`,
    `retry     : ${payload.retry}`,
    `flow      : ${payload.flow.join(" -> ")}`,
    payload.response ? `response  : ${payload.response}` : null,
    payload.error ? `error     : ${payload.error}` : null,
  ].filter(Boolean).join("\n");

  const text = `${header}\n${body}\n${footer}`;
  if (level === "error") logger.error(text);
  else loggerSuccess.info(text);
}

async function callYamahaApi(job: YamahaJob): Promise<{ sukses: boolean; raw: string }> {
  const response = await axios.post(
    YAMAHA_URL,
    { Jenis: job.Jenis, PT: job.PT, Numerator: job.Numerator },
    { headers: { "Content-Type": "application/json" }, timeout: 15000 }
  );

  const resultMessage = response.data?.data?.[0]?.resultMessage || response.data?.msg;
  const raw = JSON.stringify(response.data);
  return { sukses: String(resultMessage || "").toUpperCase() === "SUKSES", raw };
}

export async function startYamahaWorker() {
  const ch = await getChannel();
  await ch.assertQueue(YAMAHA_QUEUE, { durable: true });
  ch.prefetch(10);

  // Buat delay queues saat startup.
  // Cara kerja: pesan retry dikirim ke sini, bukan langsung ke push_jobs_yamaha.
  // RabbitMQ tahan pesan selama x-message-ttl ms, lalu otomatis pindah ke push_jobs_yamaha.
  // Worker tidak perlu sleep — slot prefetch langsung bebas setelah ack.
  for (const delay of RETRY_DELAYS_MS) {
    await ch.assertQueue(`${YAMAHA_QUEUE}_delay_${delay}ms`, {
      durable: true,
      arguments: {
        "x-message-ttl": delay,                       // berapa lama pesan ditahan di sini
        "x-dead-letter-exchange": "",                  // pakai default exchange
        "x-dead-letter-routing-key": YAMAHA_QUEUE,    // setelah TTL habis, kirim ke push_jobs_yamaha
      },
    });
  }

  console.log("[YAMAHA WORKER] listening:", YAMAHA_QUEUE);

  ch.consume(
    YAMAHA_QUEUE,
    async (msg: ConsumeMessage | null) => {
      if (!msg) return;

      const headers = msg.properties?.headers || {};
      const retry = Number(headers["x-retry"] ?? 0);

      // [1] Parse pesan — kalau JSON rusak langsung buang
      const job = parseJob(msg.content);
      if (!job) {
        logger.error("LPUSHNOTIF invalid JSON -> ack drop");
        ch.ack(msg);
        return;
      }

      const jobId = job.jobId || String(headers["x-job-id"] || "-");
      const flow: string[] = ["QUEUE"];

      // [2] Guard: field wajib kosong — skip tanpa hit API
      if (!job.Numerator || !job.PT || !job.Jenis) {
        flow.push("SKIP");
        logBlock("error", { jobId, numerator: job.Numerator || "", pt: job.PT || "", jenis: job.Jenis || "", retry, flow, error: "Numerator / PT / Jenis kosong — skip hit API" });
        ch.ack(msg); // buang, pesan mati di sini
        return;
      }

      // [3] Cek TTL — kalau sudah lewat tengah malam, tidak perlu update Yamaha
      if (expired(job)) {
        flow.push("EXPIRED");
        logBlock("error", { jobId, numerator: job.Numerator, pt: job.PT, jenis: job.Jenis, retry, flow });
        ch.ack(msg); // buang, pesan mati di sini
        return;
      }

      try {
        // [4] Hit Yamaha API
        flow.push("HITTING API");
        const { sukses, raw } = await callYamahaApi(job);

        if (sukses) {
          // [5] BERHASIL — log dan selesai
          flow.push("SUKSES");
          logBlock("info", { jobId, numerator: job.Numerator, pt: job.PT, jenis: job.Jenis, retry, flow, response: raw });
          ch.ack(msg);
          return;
        }

        // Data sudah ada di DB (duplicate key) — anggap sukses, tidak perlu retry
        if (raw.includes("duplicate key") || raw.includes("Duplicate") || raw.includes("PRIMARY KEY")) {
          flow.push("SUKSES_DUPLICATE");
          logBlock("info", { jobId, numerator: job.Numerator, pt: job.PT, jenis: job.Jenis, retry, flow, response: `duplicate key — data sudah ada, skip | raw=${raw}` });
          ch.ack(msg);
          return;
        }

        // Yamaha balas tapi resultMessage bukan "SUKSES" — anggap gagal, masuk retry
        throw new Error(`resultMessage bukan SUKSES | raw=${raw}`);

      } catch (e: any) {
        const errMsg = e?.response?.data?.msg || e?.message || "Unknown";

        // [6] Error / bukan SUKSES — masuk retry
        if (retry < MAX_RETRY && canRetry(job, retry)) {
          const delay = getDelay(retry);
          flow.push("RETRY");
          logBlock("error", { jobId, numerator: job.Numerator, pt: job.PT, jenis: job.Jenis, retry, flow, error: `${errMsg} | coba lagi dalam ${delay / 1000}s` });

          // Kirim ke delay queue yang sesuai, bukan langsung ke push_jobs_yamaha.
          // Pesan akan "tidur" di delay queue selama `delay` ms,
          // lalu RabbitMQ otomatis pindahkan ke push_jobs_yamaha.
          // x-retry di-increment agar attempt berikutnya tahu ini sudah retry ke berapa.
          const ok = ch.sendToQueue(`${YAMAHA_QUEUE}_delay_${delay}ms`, msg.content, {
            persistent: true,
            headers: { ...headers, "x-retry": retry + 1, "x-job-id": jobId },
            contentType: msg.properties.contentType,
            expiration: msg.properties.expiration,
          });

          if (!ok) {
            // buffer RabbitMQ penuh — nack agar pesan balik ke queue, coba lagi nanti
            flow.push("NACK");
            logBlock("error", { jobId, numerator: job.Numerator, pt: job.PT, jenis: job.Jenis, retry, flow, error: "buffer full" });
            ch.nack(msg, false, true);
            return;
          }

          ch.ack(msg); // slot langsung bebas, worker lanjut proses pesan lain
          return;
        }

        // [7] Retry habis (>= 10) atau TTL tidak cukup untuk retry lagi
        //     Pesan mati di sini — tidak ada yang proses lagi
        flow.push("FAILED");
        logBlock("error", { jobId, numerator: job.Numerator, pt: job.PT, jenis: job.Jenis, retry, flow, error: errMsg });
        ch.ack(msg);
      }
    },
    { noAck: false, consumerTag: `yamaha-${process.pid}` }
  );
}

startYamahaWorker().catch(err => {
  console.error("LPUSHNOTIF worker crash:", err);
  process.exit(1);
});
