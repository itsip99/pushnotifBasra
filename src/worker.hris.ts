import { ConsumeMessage } from "amqplib";
import { getChannel, QUEUE, YAMAHA_QUEUE } from "./config/rabbit";
import { NotificationJob } from "./models/notificationJob.model";
import { getCachedHIRSToken, clearCachedToken } from "./services/hirs/hirsToken";
import { sendNotification } from "./controller/HIRS/hirs";
import { logger, loggerSuccess } from "./logger/logger";

type FlowStep = "PROCESS" | "RETRY" | "SENT" | "FAILED" | "INVALID_TOKEN" | "EXPIRED";

const MAX_RETRY = 3;

// ─── ALUR KESELURUHAN ────────────────────────────────────────────────────────
//
//  [API terima request]
//       │
//       ▼
//  [push_jobs]  ←──────────────────────────────────────────────┐
//       │                                                       │
//       ▼                                                       │ (setelah TTL habis,
//  worker ambil pesan                                          │  RabbitMQ otomatis
//       │                                                       │  pindahkan pesan
//       ├─ JSON rusak      → ack, buang (tidak bisa diproses)  │  ke push_jobs)
//       ├─ TTL habis       → EXPIRED, ack, buang               │
//       │                                                       │
//       ▼                                                       │
//  hit FCM API                                                  │
//       │                                                       │
//       ├─ BERHASIL        → SENT, ack, push ke yamaha queue   │
//       │                                                       │
//       ├─ 401 token mati  → refresh token, coba sekali lagi   │
//       │    └─ berhasil   → SENT, ack                         │
//       │    └─ gagal lagi → lanjut ke retry di bawah          │
//       │                                                       │
//       ├─ 404 / token     → INVALID_TOKEN, ack, buang         │
//       │   invalid          (device sudah uninstall app)      │
//       │                                                       │
//       ├─ error lain &    → kirim ke delay queue ─────────────┘
//       │  retry < 3         push_jobs_delay_5000ms  (attempt 0, tunggu 5s)
//       │                    push_jobs_delay_15000ms (attempt 1, tunggu 15s)
//       │                    push_jobs_delay_30000ms (attempt 2, tunggu 30s)
//       │                    ack, slot prefetch langsung bebas
//       │
//       └─ retry >= 3 atau → FAILED, ack, buang
//          TTL tidak cukup   (pesan mati di sini, tidak ada lagi yang proses)
//
// ─────────────────────────────────────────────────────────────────────────────

function pushYamahaCallback(ch: any, job: NotificationJob) {
  const Numerator = job.metaData?.Numerator;
  const PT = job.metaData?.PT;
  const Jenis = job.metaData?.Jenis;

  // jangan push ke YAMAHA_QUEUE kalau Numerator, PT, atau Jenis kosong
  // API Yamaha tidak bisa proses data kosong, skip lebih baik daripada retry sia-sia
  if (!Numerator || !PT || !Jenis) {
    logger.error(`LPUSHNOTIF skip — field wajib kosong | jobId=${job.jobId} | Numerator=${Numerator} | PT=${PT} | Jenis=${Jenis}`);
    return;
  }

  const yamahaJob = {
    jobId: job.jobId,
    createdAt: Date.now(),
    ttlMs: 24 * 60 * 60 * 1000,
    Jenis: Jenis || "",
    PT: PT || "",
    Numerator: Numerator || "",
  };

  const ok = ch.sendToQueue(YAMAHA_QUEUE, Buffer.from(JSON.stringify(yamahaJob)), {
    persistent: true,
    headers: { "x-retry": 0, "x-job-id": job.jobId },
  });

  if (ok) {
    loggerSuccess.info(`LPUSHNOTIF job masuk queue | jobId=${job.jobId} | Numerator=${Numerator} | PT=${PT} | Jenis=${Jenis}`);
  } else {
    logger.error(`LPUSHNOTIF gagal masuk queue | jobId=${job.jobId} | Numerator=${Numerator}`);
  }
}

const RETRY_DELAYS_MS = [5_000, 15_000, 30_000]; // delay per attempt: 5s, 15s, 30s

// cek apakah masih ada waktu cukup untuk retry (delay + buffer 10s) sebelum TTL habis
function canRetry(job: NotificationJob, attempt: number): boolean {
  const delay = RETRY_DELAYS_MS[attempt] ?? 30_000;
  const needed = delay + 10_000; // buffer 10 detik
  const remaining = job.createdAt + job.ttlMs - Date.now();
  return remaining > needed;
}

// ---------- helpers ----------
function parseJob(buf: Buffer): NotificationJob | null {
  try {
    return JSON.parse(buf.toString()) as NotificationJob;
  } catch {
    return null;
  }
}

function expired(job: NotificationJob): boolean {
  return Date.now() > job.createdAt + job.ttlMs;
}

function errMsg(err: any): string {
  return err?.response?.data?.error?.message || err?.message || "Unknown";
}

function invalidToken(err: any): boolean {
  const msg = errMsg(err);
  return (
    msg.includes("UNREGISTERED") ||
    msg.includes("registration-token-not-registered") ||
    msg.includes("Requested entity was not found")
  );
}

// store flow in message headers so it survives requeue
function getFlow(headers: any): FlowStep[] {
  const raw = headers?.["x-flow"];
  if (!raw) return [];
  return String(raw).split("|").filter(Boolean) as FlowStep[];
}

function setFlow(headers: any, flow: FlowStep[]) {
  return { ...headers, "x-flow": flow.join("|") };
}

function metaToLog(meta: any, maxLen = 600): string {
  if (!meta) return "-";
  try {
    const s = JSON.stringify(meta);
    return s.length > maxLen ? s.slice(0, maxLen) + "...(truncated)" : s;
  } catch {
    return String(meta);
  }
}

// ONE BLOCK LOG (header + footer)
function logBlock(
  level: "info" | "error",
  payload: {
    jobId: string;
    userId: string;
    jenis: string;
    retry: number;
    flow: FlowStep[];
    status?: number;
    message?: string;
    meta?: any;
    fcmId?: string;
    ms?: number;
  }
) {
  const header = "========== HIRS WORKER ==========";
  const footer = "=================================";

  const body = [
    `jobId : ${payload.jobId}`,
    `user  : ${payload.userId}`,
    `jenis : ${payload.jenis}`,
    `retry : ${payload.retry}`,
    payload.status !== undefined ? `http  : ${payload.status}` : null,
    `flow  : ${payload.flow.join(" -> ")}`,
    // SENT = FCM menerima pesan (fcmId ada), belum bukti notif tampil di HP
    payload.fcmId ? `fcmId : ${payload.fcmId}` : null,
    payload.ms !== undefined ? `ms    : ${payload.ms}` : null,
    `meta  : ${metaToLog(payload.meta)}`,
    payload.message ? `error : ${payload.message}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const text = `${header}\n${body}\n${footer}`;

  if (level === "error") logger.error(text);
  else loggerSuccess.info(text);
}

// ---------- worker ----------
export async function startWorker() {
  const ch = await getChannel();
  ch.prefetch(20);

  await ch.assertQueue(YAMAHA_QUEUE, { durable: true });

  // Buat delay queues saat startup.
  // Cara kerja: pesan retry dikirim ke sini, bukan langsung ke push_jobs.
  // RabbitMQ tahan pesan selama x-message-ttl ms, lalu otomatis pindah ke push_jobs.
  // Worker tidak perlu sleep — slot prefetch langsung bebas setelah ack.
  for (const delay of RETRY_DELAYS_MS) {
    await ch.assertQueue(`${QUEUE}_delay_${delay}ms`, {
      durable: true,
      arguments: {
        "x-message-ttl": delay,                  // berapa lama pesan ditahan di sini
        "x-dead-letter-exchange": "",             // pakai default exchange
        "x-dead-letter-routing-key": QUEUE,       // setelah TTL habis, kirim ke push_jobs
      },
    });
  }

  console.log("[WORKER] listening:", QUEUE);

  ch.consume(
    QUEUE,
    async (msg: ConsumeMessage | null) => {
      if (!msg) return;

      const headers = msg.properties?.headers || {};
      const retry = Number(headers["x-retry"] ?? 0);

      // [1] Parse pesan — kalau JSON rusak langsung buang
      const job = parseJob(msg.content);
      if (!job) {
        logger.error("HIRS_WORKER | INVALID_JSON | ack-drop");
        ch.ack(msg);
        return;
      }

      const jobId = job.jobId || String(headers["x-job-id"] || "-");
      const userId = job?.metaData?.userid || String(headers["x-userid"] || "-");
      const jenis = job?.metaData?.jenis || String(headers["x-jenis"] || "-");

      // [2] Ambil riwayat flow dari header (bertahan saat requeue)
      const flow = getFlow(headers);
      if (flow.length === 0) flow.push("PROCESS");

      // [3] Cek TTL — kalau sudah lewat tengah malam, notifikasi tidak relevan lagi
      if (job.createdAt && job.ttlMs && expired(job)) {
        flow.push("EXPIRED");
        logBlock("info", { jobId, userId, jenis, retry, flow, meta: job.metaData });
        ch.ack(msg); // buang, pesan mati di sini
        return;
      }

      const startedAt = Date.now();
      try {
        // [4] Ambil token FCM (dari cache atau minta baru ke Google)
        const token = await getCachedHIRSToken();

        // [5] Kirim notifikasi ke FCM
        const res = await sendNotification(job, token);

        // [6] BERHASIL — log, ack, lalu trigger update ke Yamaha
        flow.push("SENT");
        logBlock("info", { jobId, userId, jenis, retry, flow, status: res.status, fcmId: res.data?.name, ms: Date.now() - startedAt, meta: job.metaData });
        pushYamahaCallback(ch, job);
        ch.ack(msg);
        return;

      } catch (e: any) {
        const status = e?.response?.status;
        const message = errMsg(e);

        // [7] Token expired (401) — refresh sekali, langsung coba kirim lagi
        if (status === 401) {
          clearCachedToken();
          try {
            const newToken = await getCachedHIRSToken();
            const res = await sendNotification(job, newToken);

            flow.push("SENT");
            logBlock("info", { jobId, userId, jenis, retry, flow, status: res.status, fcmId: res.data?.name, ms: Date.now() - startedAt, meta: job.metaData });
            pushYamahaCallback(ch, job);
            ch.ack(msg);
            return;
          } catch {
            // refresh gagal juga, lanjut ke retry normal di bawah
          }
        }

        // [8] Device token tidak valid (app diuninstall / token kadaluarsa dari sisi HP)
        //     Tidak ada gunanya retry — langsung buang
        if (status === 404 || invalidToken(e)) {
          flow.push("INVALID_TOKEN");
          logBlock("info", { jobId, userId, jenis, retry, flow, status, message, meta: job.metaData });

          const deviceToken = job.message?.token;
          if (deviceToken) {
            logger.error(`[HRIS] token invalid | token=${deviceToken} | userId=${userId} | perlu dihapus dari DB`);
          }

          ch.ack(msg); // buang, pesan mati di sini
          return;
        }

        // [9] Error lain (jaringan, FCM timeout, dll) — masuk retry
        if (retry < MAX_RETRY && canRetry(job, retry)) {
          const delay = RETRY_DELAYS_MS[retry] ?? 30_000;
          flow.push("RETRY");

          logBlock("error", {
            jobId, userId, jenis, retry, flow, status,
            message: `${message} — retry dalam ${delay / 1000}s`,
            meta: job.metaData,
          });

          // Kirim ke delay queue yang sesuai, bukan langsung ke push_jobs.
          // Pesan akan "tidur" di delay queue selama `delay` ms,
          // lalu RabbitMQ otomatis pindahkan ke push_jobs.
          // x-retry di-increment agar attempt berikutnya tahu ini sudah retry ke berapa.
          const ok = ch.sendToQueue(`${QUEUE}_delay_${delay}ms`, msg.content, {
            persistent: true,
            headers: setFlow({ ...headers, "x-retry": retry + 1 }, flow),
            contentType: msg.properties.contentType,
            timestamp: msg.properties.timestamp,
            expiration: msg.properties.expiration,
          });

          if (!ok) {
            // buffer RabbitMQ penuh — nack agar pesan balik ke queue, coba lagi nanti
            logBlock("error", {
              jobId, userId, jenis, retry, flow, status,
              message: "buffer full -> NACK requeue",
              meta: job.metaData,
            });
            ch.nack(msg, false, true);
            return;
          }

          ch.ack(msg); // slot langsung bebas, worker lanjut proses pesan lain
          return;
        }

        // [10] Retry habis (>= 3) atau TTL tidak cukup untuk retry lagi
        //      Pesan mati di sini — tidak ada yang proses lagi
        flow.push("FAILED");
        logBlock("error", { jobId, userId, jenis, retry, flow, status, message, meta: job.metaData });
        ch.ack(msg);
        return;
      }
    },
    { noAck: false, consumerTag: `worker-${process.pid}` }
  );
}

// self start
startWorker().catch((err) => {
  console.error("[HIRS] crash:", err);
  process.exit(1);
});
