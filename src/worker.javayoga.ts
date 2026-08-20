// worker.javayoga.ts
import axios from "axios";
import color from "colors";
import { ConsumeMessage } from "amqplib";

import { JAVA_QUEUE, getChannel } from "./config/rabbit";
import { fcmAgent } from "./config/httpAgent";
import { getCachedjavaYogaToken, clearCachedToken } from "./services/javaYoga/javaToken";

const FCM_URL =
  "https://fcm.googleapis.com/v1/projects/javayoga-f1963/messages:send";

type JavaYogaJob = {
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

function isExpired(job: JavaYogaJob): boolean {
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

async function sendToFcm(job: JavaYogaJob, token: string) {
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

async function startJavaWorker() {
  const ch = await getChannel();

  await ch.assertQueue(JAVA_QUEUE, { durable: true });
  ch.prefetch(5);

  console.log(`? JavaYoga worker ready. Queue: ${JAVA_QUEUE}`);

  ch.consume(
    JAVA_QUEUE,
    async (msg: ConsumeMessage | null) => {
      if (!msg) return;

      const headers = msg.properties?.headers || {};
      const retry = Number(headers["x-retry"] ?? 0);
      const maxRetry = 3;

      const parsed = safeJsonParse<JavaYogaJob>(msg.content);
      if (!parsed.ok) {
        console.error("[JAVA] invalid JSON -> ack drop");
        ch.ack(msg);
        return;
      }

      const job = parsed.value;

      if (isExpired(job)) {
        console.warn(`[JAVA] expired job -> ack drop token=${job?.message?.token}`);
        ch.ack(msg);
        return;
      }

      try {
        const token = await getCachedjavaYogaToken();
        await sendToFcm(job, token);

        console.log(`${color.green("JAVA")} | Success | ${job.message.token}`);
        ch.ack(msg);
      } catch (e: any) {
        const status = e?.response?.status;

        // 401: refresh token once then retry
        if (status === 401) {
          clearCachedToken();
          try {
            const newToken = await getCachedjavaYogaToken();
            await sendToFcm(job, newToken);
            console.log(`${color.green("JAVA")} | Success (after token refresh) | ${job.message.token}`);
            ch.ack(msg);
            return;
          } catch {
            // continue to retry flow
          }
        }

        const firebaseMsg = e?.response?.data?.error?.message || e?.message || "Unknown";

        console.error(
          `[JAVA] fail status=${status} retry=${retry} token=${job?.message?.token} msg=${firebaseMsg}`
        );

        // invalid device token -> stop retry
        if (status === 404 || isNonRetryable(e)) {
          ch.ack(msg);
          return;
        }

        // retry
        if (retry < maxRetry) {
          const nextRetry = retry + 1;

          const ok = ch.sendToQueue(JAVA_QUEUE, msg.content, {
            persistent: true,
            contentType: msg.properties.contentType,
            timestamp: msg.properties.timestamp,
            expiration: msg.properties.expiration,
            headers: { ...headers, "x-retry": nextRetry },
          });

          // ? kalau republish gagal -> jangan ack (biar ga lost)
          if (!ok) {
            console.warn("[JAVA] buffer full -> NACK requeue");
            ch.nack(msg, false, true);
            return;
          }

          ch.ack(msg);
          return;
        }

        // drop after max retry
        ch.ack(msg);
      }
    },
    { noAck: false, consumerTag: `javayoga-${process.pid}` }
  );
}

startJavaWorker().catch((err) => {
  console.error("[JAVA] worker crash:", err);
  process.exit(1);
});