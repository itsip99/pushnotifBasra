import amqp, { Channel, ChannelModel } from "amqplib";
import { logger } from "../logger/logger";

let connection: ChannelModel | null = null;
let channel: Channel | null = null;
let connecting: Promise<ChannelModel> | null = null;
let channeling: Promise<Channel> | null = null;

export const QUEUE = "push_jobs";
export const JAVA_QUEUE = "push_jobs_javayoga";
export const YAMAHA_QUEUE = "push_jobs_yamaha";
export const WELLNESS_QUEUE = "push_jobs_javawellness";
export const LSA_QUEUE = "push_jobs_lsa";

const RABBIT_URL = process.env.RABBIT_URL || "amqp://admin:suryatimur@localhost";

function resetAll() {
  connection = null;
  channel = null;
  connecting = null;
  channeling = null;
}

async function reconnectWithBackoff(attempt = 1): Promise<void> {
  const delay = Math.min(1000 * 2 ** attempt, 30000); // max 30 detik
  logger.info(`[RabbitMQ] reconnect dalam ${delay / 1000}s (attempt ${attempt})...`);
  await new Promise(r => setTimeout(r, delay));
  try {
    await getChannel();
    logger.info("[RabbitMQ] reconnect berhasil");
  } catch (err: any) {
    logger.error(`[RabbitMQ] reconnect gagal (attempt ${attempt}) | ${err?.message || err}`);
    reconnectWithBackoff(attempt + 1);
  }
}

export async function getChannel(): Promise<Channel> {
  if (!connection) {
    if (!connecting) {
      connecting = amqp
        .connect(RABBIT_URL, { heartbeat: 30 })
        .then(conn => {
          connection = conn;
          connecting = null;

          conn.on("error", err => {
            logger.error(`[RabbitMQ] connection error | ${err.message}`);
            resetAll();
            reconnectWithBackoff();
          });
          conn.on("close", () => {
            logger.error("[RabbitMQ] koneksi tertutup — mencoba reconnect...");
            resetAll();
            reconnectWithBackoff();
          });

          return conn;
        })
        .catch(err => {
          connecting = null;
          throw err;
        });
    }
    await connecting;
  }

  if (!channel) {
    if (!channeling) {
      channeling = connection!
        .createChannel()
        .then(async ch => {
          await ch.assertQueue(QUEUE, { durable: true });
          channel = ch;
          channeling = null;
          return ch;
        })
        .catch(err => {
          channeling = null;
          throw err;
        });
    }
    await channeling;
  }

  return channel!;
}
