import axios from "axios";
import { ConsumeMessage } from "amqplib";
import { WELLNESS_QUEUE, getChannel } from "./config/rabbit";
import { getCachedJavaWellnessToken, clearCachedWellnessToken } from "./services/javaWellness/javaWellnessToken";
import { logger, loggerSuccess, logErrorBlock } from "./logger/logger";

const FCM_URL = "https://fcm.googleapis.com/v1/projects/javawellness-3c6ad/messages:send";
const MAX_RETRY = 3;
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000];

type WellnessJob = {
  jobId?: string;
  createdAt?: number;
  ttlMs?: number;
  metaData?: Record<string, any>;
  message: {
    token: string;
    notification?: { title?: string; body?: string };
    data?: Record<string, string>;
    android?: any;
    apns?: any;
  };
};

type FlowStep = "PROCESS" | "RETRY" | "SENT" | "FAILED" | "INVALID_TOKEN" | "EXPIRED";

function parseJob(buf: Buffer): WellnessJob | null {
  try {
    return JSON.parse(buf.toString()) as WellnessJob;
  } catch {
    return null;
  }
}

function expired(job: WellnessJob): boolean {
  if (!job.createdAt || !job.ttlMs) return false;
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

function getFlow(headers: any): FlowStep[] {
  const raw = headers?.["x-flow"];
  if (!raw) return [];
  return String(raw).split("|").filter(Boolean) as FlowStep[];
}

function setFlow(headers: any, flow: FlowStep[]) {
  return { ...headers, "x-flow": flow.join("|") };
}

function canRetry(job: WellnessJob, attempt: number): boolean {
  const delay = RETRY_DELAYS_MS[attempt] ?? 30_000;
  if (!job.createdAt || !job.ttlMs) return true;
  const remaining = job.createdAt + job.ttlMs - Date.now();
  return remaining > delay + 10_000;
}

function logBlock(level: "info" | "error", payload: {
  jobId: string;
  userId: string;
  retry: number;
  flow: FlowStep[];
  status?: number;
  message?: string;
  meta?: any;
}) {
  const header = "========== WELLNESS WORKER ==========";
  const footer = "=====================================";
  const body = [
    `jobId  : ${payload.jobId}`,
    `user   : ${payload.userId}`,
    `retry  : ${payload.retry}`,
    payload.status !== undefined ? `http   : ${payload.status}` : null,
    `flow   : ${payload.flow.join(" -> ")}`,
    payload.message ? `error  : ${payload.message}` : null,
  ].filter(Boolean).join("\n");

  const text = `${header}\n${body}\n${footer}`;
  if (level === "error") logger.error(text);
  else loggerSuccess.info(text);
}

export async function startWellnessWorker() {
  const ch = await getChannel();
  ch.prefetch(10);

  await ch.assertQueue(WELLNESS_QUEUE, { durable: true });

  for (const delay of RETRY_DELAYS_MS) {
    await ch.assertQueue(`${WELLNESS_QUEUE}_delay_${delay}ms`, {
      durable: true,
      arguments: {
        "x-message-ttl": delay,
        "x-dead-letter-exchange": "",
        "x-dead-letter-routing-key": WELLNESS_QUEUE,
      },
    });
  }

  logger.info(`[WELLNESS WORKER] listening: ${WELLNESS_QUEUE}`);

  ch.consume(
    WELLNESS_QUEUE,
    async (msg: ConsumeMessage | null) => {
      if (!msg) return;

      const headers = msg.properties?.headers || {};
      const retry = Number(headers["x-retry"] ?? 0);

      const job = parseJob(msg.content);
      if (!job) {
        logErrorBlock({ source: "wellnessWorker", type: "INVALID_JSON", flow: ["PROCESS", "INVALID_JSON"], error: "JSON rusak, ack drop" });
        ch.ack(msg);
        return;
      }

      const jobId = job.jobId || String(headers["x-job-id"] || "-");
      const userId = job?.metaData?.userid || String(headers["x-userid"] || "-");

      const flow = getFlow(headers);
      if (flow.length === 0) flow.push("PROCESS");

      if (expired(job)) {
        flow.push("EXPIRED");
        logBlock("info", { jobId, userId, retry, flow });
        ch.ack(msg);
        return;
      }

      try {
        const token = await getCachedJavaWellnessToken();
        await axios.post(FCM_URL, { message: job.message }, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          timeout: 15000,
        });

        flow.push("SENT");
        logBlock("info", { jobId, userId, retry, flow });
        ch.ack(msg);
        return;

      } catch (e: any) {
        const status = e?.response?.status;
        const message = errMsg(e);

        if (status === 401) {
          clearCachedWellnessToken();
          try {
            const newToken = await getCachedJavaWellnessToken();
            await axios.post(FCM_URL, { message: job.message }, {
              headers: { Authorization: `Bearer ${newToken}`, "Content-Type": "application/json" },
              timeout: 15000,
            });
            flow.push("SENT");
            logBlock("info", { jobId, userId, retry, flow, status });
            ch.ack(msg);
            return;
          } catch {
            // lanjut ke retry normal
          }
        }

        if (status === 404 || invalidToken(e)) {
          flow.push("INVALID_TOKEN");
          logBlock("info", { jobId, userId, retry, flow, status, message });
          ch.ack(msg);
          return;
        }

        if (retry < MAX_RETRY && canRetry(job, retry)) {
          const delay = RETRY_DELAYS_MS[retry] ?? 30_000;
          flow.push("RETRY");
          logBlock("error", { jobId, userId, retry, flow, status, message: `${message} — retry dalam ${delay / 1000}s` });

          const ok = ch.sendToQueue(`${WELLNESS_QUEUE}_delay_${delay}ms`, msg.content, {
            persistent: true,
            headers: setFlow({ ...headers, "x-retry": retry + 1 }, flow),
            contentType: msg.properties.contentType,
            timestamp: msg.properties.timestamp,
            expiration: msg.properties.expiration,
          });

          if (!ok) {
            logBlock("error", { jobId, userId, retry, flow, status, message: "buffer full -> NACK requeue" });
            ch.nack(msg, false, true);
            return;
          }

          ch.ack(msg);
          return;
        }

        flow.push("FAILED");
        logBlock("error", { jobId, userId, retry, flow, status, message });
        ch.ack(msg);
      }
    },
    { noAck: false, consumerTag: `wellness-${process.pid}` }
  );
}

startWellnessWorker().catch(err => {
  logger.error(`[WELLNESS] worker crash: ${err?.message || err}`);
  process.exit(1);
});
