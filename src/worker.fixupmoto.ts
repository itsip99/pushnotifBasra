// worker.fixupmoto.ts
import axios from "axios";
import { ConsumeMessage } from "amqplib";

import { FIXUPMOTO_QUEUE, getChannel } from "./config/rabbit";
import { fcmAgent } from "./config/httpAgent";
import { getCachedFixUpMotoToken, clearCachedToken } from "./services/fixupMoto/fixupMotoToken";
import { logger, loggerSuccess } from "./logger/logger";
import { FIXUPMOTO_FCM_URL } from "./services/fixupMoto/token_firebase_service_fixupMoto";

const FCM_URL = FIXUPMOTO_FCM_URL;

type FixUpMotoJob = {
  jobId?: string;
  createdAt?: number;
  ttlMs?: number;
  message: {
    token: string;
    notification?: { title?: string; body?: string };
    data?: Record<string, string>;
    android?: any;
    apns?: any;
  };
};

function safeJsonParse<T>(buf: Buffer): { ok: true; value: T } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(buf.toString()) as T };
  } catch {
    return { ok: false };
  }
}

function isExpired(job: FixUpMotoJob): boolean {
  if (!job.createdAt || !job.ttlMs) return false; // kalau job tidak pakai TTL, skip
  return Date.now() > job.createdAt + job.ttlMs;
}

function isNonRetryable(err: any): boolean {
  const msg = err?.response?.data?.error?.message || "";
  return (
    msg.includes("UNREGISTERED") ||
    msg.includes("registration-token-not-registered") ||
    msg.includes("Requested entity was not found")
  );
}

async function sendToFcm(job: FixUpMotoJob, token: string) {
  return axios.post(
    FCM_URL,
    { message: job.message },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
      httpsAgent: fcmAgent,
    }
  );
}

type Status = "FCM_ACCEPTED" | "RETRY" | "INVALID_TOKEN" | "EXPIRED" | "FAILED";

function maskToken(token?: string): string {
  if (!token || token.length < 10) return token || "-";
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

// Satu baris per hasil supaya mudah di-grep berdasarkan jobId.
// FCM_ACCEPTED = FCM menerima pesan (ada messageId), BUKAN bukti notif tampil di HP.
function logResult(
  status: Status,
  p: { jobId: string; attempt: number; token?: string; ms?: number; http?: number; fcmId?: string; error?: string }
) {
  const line = [
    `[FIXUPMOTO] ${status}`,
    `jobId=${p.jobId}`,
    `queue=${FIXUPMOTO_QUEUE}`,
    `attempt=${p.attempt}`,
    `token=${maskToken(p.token)}`,
    p.ms !== undefined ? `ms=${p.ms}` : null,
    p.http !== undefined ? `http=${p.http}` : null,
    p.fcmId ? `fcmId=${p.fcmId}` : null,
    p.error ? `error=${p.error}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  if (status === "FCM_ACCEPTED" || status === "EXPIRED") loggerSuccess.info(line);
  else logger.error(line);
}

async function startFixUpMotoWorker() {
  const ch = await getChannel();

  await ch.assertQueue(FIXUPMOTO_QUEUE, { durable: true });
  ch.prefetch(5);

  console.log(`? FixUpMoto worker ready. Queue: ${FIXUPMOTO_QUEUE}`);

  ch.consume(
    FIXUPMOTO_QUEUE,
    async (msg: ConsumeMessage | null) => {
      if (!msg) return;

      const headers = msg.properties?.headers || {};
      const retry = Number(headers["x-retry"] ?? 0);
      const maxRetry = 3;
      const attempt = retry + 1;

      const parsed = safeJsonParse<FixUpMotoJob>(msg.content);
      if (!parsed.ok) {
        logger.error("[FIXUPMOTO] INVALID_JSON | ack-drop");
        ch.ack(msg);
        return;
      }

      const job = parsed.value;
      // job lama (sebelum ada x-job-id) tetap bisa diproses, hanya tanpa id
      const jobId = String(job.jobId || headers["x-job-id"] || msg.properties?.messageId || "-");
      const deviceToken = job?.message?.token;
      const startedAt = Date.now();

      if (isExpired(job)) {
        logResult("EXPIRED", { jobId, attempt, token: deviceToken });
        ch.ack(msg);
        return;
      }

      try {
        const token = await getCachedFixUpMotoToken();
        const res = await sendToFcm(job, token);

        logResult("FCM_ACCEPTED", { jobId, attempt, token: deviceToken, ms: Date.now() - startedAt, http: res.status, fcmId: res.data?.name });
        ch.ack(msg);
      } catch (e: any) {
        const status = e?.response?.status;

        // 401: refresh token once then retry
        if (status === 401) {
          clearCachedToken();
          try {
            const newToken = await getCachedFixUpMotoToken();
            const res = await sendToFcm(job, newToken);
            logResult("FCM_ACCEPTED", { jobId, attempt, token: deviceToken, ms: Date.now() - startedAt, http: res.status, fcmId: res.data?.name });
            ch.ack(msg);
            return;
          } catch {
            // continue to retry flow
          }
        }

        const firebaseMsg = e?.response?.data?.error?.message || e?.message || "Unknown";
        const base = { jobId, attempt, token: deviceToken, ms: Date.now() - startedAt, http: status, error: firebaseMsg };

        // invalid device token -> stop retry
        if (status === 404 || isNonRetryable(e)) {
          logResult("INVALID_TOKEN", base);
          ch.ack(msg);
          return;
        }

        // retry
        if (retry < maxRetry) {
          const nextRetry = retry + 1;

          const ok = ch.sendToQueue(FIXUPMOTO_QUEUE, msg.content, {
            persistent: true,
            contentType: msg.properties.contentType,
            messageId: msg.properties.messageId,
            timestamp: msg.properties.timestamp,
            expiration: msg.properties.expiration,
            headers: { ...headers, "x-retry": nextRetry },
          });

          // ? kalau republish gagal -> jangan ack (biar ga lost)
          if (!ok) {
            logResult("RETRY", { ...base, error: `${firebaseMsg} | buffer full -> NACK requeue` });
            ch.nack(msg, false, true);
            return;
          }

          logResult("RETRY", base);
          ch.ack(msg);
          return;
        }

        // drop after max retry
        logResult("FAILED", base);
        ch.ack(msg);
      }
    },
    { noAck: false, consumerTag: `fixupmoto-${process.pid}` }
  );
}

startFixUpMotoWorker().catch((err) => {
  console.error("[FIXUPMOTO] worker crash:", err);
  process.exit(1);
});