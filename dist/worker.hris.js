"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWorker = void 0;
const rabbit_1 = require("./config/rabbit");
const hirsToken_1 = require("./services/hirs/hirsToken");
const hirs_1 = require("./controller/HIRS/hirs");
const logger_1 = require("./logger/logger");
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
function pushYamahaCallback(ch, job) {
    var _a, _b, _c;
    const Numerator = (_a = job.metaData) === null || _a === void 0 ? void 0 : _a.Numerator;
    const PT = (_b = job.metaData) === null || _b === void 0 ? void 0 : _b.PT;
    const Jenis = (_c = job.metaData) === null || _c === void 0 ? void 0 : _c.Jenis;
    // jangan push ke YAMAHA_QUEUE kalau Numerator, PT, atau Jenis kosong
    // API Yamaha tidak bisa proses data kosong, skip lebih baik daripada retry sia-sia
    if (!Numerator || !PT || !Jenis) {
        logger_1.logger.error(`LPUSHNOTIF skip — field wajib kosong | jobId=${job.jobId} | Numerator=${Numerator} | PT=${PT} | Jenis=${Jenis}`);
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
    const ok = ch.sendToQueue(rabbit_1.YAMAHA_QUEUE, Buffer.from(JSON.stringify(yamahaJob)), {
        persistent: true,
        headers: { "x-retry": 0, "x-job-id": job.jobId },
    });
    if (ok) {
        logger_1.loggerSuccess.info(`LPUSHNOTIF job masuk queue | jobId=${job.jobId} | Numerator=${Numerator} | PT=${PT} | Jenis=${Jenis}`);
    }
    else {
        logger_1.logger.error(`LPUSHNOTIF gagal masuk queue | jobId=${job.jobId} | Numerator=${Numerator}`);
    }
}
const RETRY_DELAYS_MS = [5000, 15000, 30000]; // delay per attempt: 5s, 15s, 30s
// cek apakah masih ada waktu cukup untuk retry (delay + buffer 10s) sebelum TTL habis
function canRetry(job, attempt) {
    var _a;
    const delay = (_a = RETRY_DELAYS_MS[attempt]) !== null && _a !== void 0 ? _a : 30000;
    const needed = delay + 10000; // buffer 10 detik
    const remaining = job.createdAt + job.ttlMs - Date.now();
    return remaining > needed;
}
// ---------- helpers ----------
function parseJob(buf) {
    try {
        return JSON.parse(buf.toString());
    }
    catch (_a) {
        return null;
    }
}
function expired(job) {
    return Date.now() > job.createdAt + job.ttlMs;
}
function errMsg(err) {
    var _a, _b, _c;
    return ((_c = (_b = (_a = err === null || err === void 0 ? void 0 : err.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) === null || _c === void 0 ? void 0 : _c.message) || (err === null || err === void 0 ? void 0 : err.message) || "Unknown";
}
function invalidToken(err) {
    const msg = errMsg(err);
    return (msg.includes("UNREGISTERED") ||
        msg.includes("registration-token-not-registered") ||
        msg.includes("Requested entity was not found"));
}
// store flow in message headers so it survives requeue
function getFlow(headers) {
    const raw = headers === null || headers === void 0 ? void 0 : headers["x-flow"];
    if (!raw)
        return [];
    return String(raw).split("|").filter(Boolean);
}
function setFlow(headers, flow) {
    return Object.assign(Object.assign({}, headers), { "x-flow": flow.join("|") });
}
function metaToLog(meta, maxLen = 600) {
    if (!meta)
        return "-";
    try {
        const s = JSON.stringify(meta);
        return s.length > maxLen ? s.slice(0, maxLen) + "...(truncated)" : s;
    }
    catch (_a) {
        return String(meta);
    }
}
// ONE BLOCK LOG (header + footer)
function logBlock(level, payload) {
    const header = "========== HIRS WORKER ==========";
    const footer = "=================================";
    const body = [
        `jobId : ${payload.jobId}`,
        `user  : ${payload.userId}`,
        `jenis : ${payload.jenis}`,
        `retry : ${payload.retry}`,
        payload.status !== undefined ? `http  : ${payload.status}` : null,
        `flow  : ${payload.flow.join(" -> ")}`,
        `meta  : ${metaToLog(payload.meta)}`,
        payload.message ? `error : ${payload.message}` : null,
    ]
        .filter(Boolean)
        .join("\n");
    const text = `${header}\n${body}\n${footer}`;
    if (level === "error")
        logger_1.logger.error(text);
    else
        logger_1.loggerSuccess.info(text);
}
// ---------- worker ----------
function startWorker() {
    return __awaiter(this, void 0, void 0, function* () {
        const ch = yield (0, rabbit_1.getChannel)();
        ch.prefetch(20);
        yield ch.assertQueue(rabbit_1.YAMAHA_QUEUE, { durable: true });
        // Buat delay queues saat startup.
        // Cara kerja: pesan retry dikirim ke sini, bukan langsung ke push_jobs.
        // RabbitMQ tahan pesan selama x-message-ttl ms, lalu otomatis pindah ke push_jobs.
        // Worker tidak perlu sleep — slot prefetch langsung bebas setelah ack.
        for (const delay of RETRY_DELAYS_MS) {
            yield ch.assertQueue(`${rabbit_1.QUEUE}_delay_${delay}ms`, {
                durable: true,
                arguments: {
                    "x-message-ttl": delay, // berapa lama pesan ditahan di sini
                    "x-dead-letter-exchange": "", // pakai default exchange
                    "x-dead-letter-routing-key": rabbit_1.QUEUE, // setelah TTL habis, kirim ke push_jobs
                },
            });
        }
        console.log("[WORKER] listening:", rabbit_1.QUEUE);
        ch.consume(rabbit_1.QUEUE, (msg) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g;
            if (!msg)
                return;
            const headers = ((_a = msg.properties) === null || _a === void 0 ? void 0 : _a.headers) || {};
            const retry = Number((_b = headers["x-retry"]) !== null && _b !== void 0 ? _b : 0);
            // [1] Parse pesan — kalau JSON rusak langsung buang
            const job = parseJob(msg.content);
            if (!job) {
                logger_1.logger.error("HIRS_WORKER | INVALID_JSON | ack-drop");
                ch.ack(msg);
                return;
            }
            const jobId = job.jobId || String(headers["x-job-id"] || "-");
            const userId = ((_c = job === null || job === void 0 ? void 0 : job.metaData) === null || _c === void 0 ? void 0 : _c.userid) || String(headers["x-userid"] || "-");
            const jenis = ((_d = job === null || job === void 0 ? void 0 : job.metaData) === null || _d === void 0 ? void 0 : _d.jenis) || String(headers["x-jenis"] || "-");
            // [2] Ambil riwayat flow dari header (bertahan saat requeue)
            const flow = getFlow(headers);
            if (flow.length === 0)
                flow.push("PROCESS");
            // [3] Cek TTL — kalau sudah lewat tengah malam, notifikasi tidak relevan lagi
            if (job.createdAt && job.ttlMs && expired(job)) {
                flow.push("EXPIRED");
                logBlock("info", { jobId, userId, jenis, retry, flow, meta: job.metaData });
                ch.ack(msg); // buang, pesan mati di sini
                return;
            }
            try {
                // [4] Ambil token FCM (dari cache atau minta baru ke Google)
                const token = yield (0, hirsToken_1.getCachedHIRSToken)();
                // [5] Kirim notifikasi ke FCM
                yield (0, hirs_1.sendNotification)(job, token);
                // [6] BERHASIL — log, ack, lalu trigger update ke Yamaha
                flow.push("SENT");
                logBlock("info", { jobId, userId, jenis, retry, flow, meta: job.metaData });
                pushYamahaCallback(ch, job);
                ch.ack(msg);
                return;
            }
            catch (e) {
                const status = (_e = e === null || e === void 0 ? void 0 : e.response) === null || _e === void 0 ? void 0 : _e.status;
                const message = errMsg(e);
                // [7] Token expired (401) — refresh sekali, langsung coba kirim lagi
                if (status === 401) {
                    (0, hirsToken_1.clearCachedToken)();
                    try {
                        const newToken = yield (0, hirsToken_1.getCachedHIRSToken)();
                        yield (0, hirs_1.sendNotification)(job, newToken);
                        flow.push("SENT");
                        logBlock("info", { jobId, userId, jenis, retry, flow, status, meta: job.metaData });
                        pushYamahaCallback(ch, job);
                        ch.ack(msg);
                        return;
                    }
                    catch (_h) {
                        // refresh gagal juga, lanjut ke retry normal di bawah
                    }
                }
                // [8] Device token tidak valid (app diuninstall / token kadaluarsa dari sisi HP)
                //     Tidak ada gunanya retry — langsung buang
                if (status === 404 || invalidToken(e)) {
                    flow.push("INVALID_TOKEN");
                    logBlock("info", { jobId, userId, jenis, retry, flow, status, message, meta: job.metaData });
                    const deviceToken = (_f = job.message) === null || _f === void 0 ? void 0 : _f.token;
                    if (deviceToken) {
                        logger_1.logger.error(`[HRIS] token invalid | token=${deviceToken} | userId=${userId} | perlu dihapus dari DB`);
                    }
                    ch.ack(msg); // buang, pesan mati di sini
                    return;
                }
                // [9] Error lain (jaringan, FCM timeout, dll) — masuk retry
                if (retry < MAX_RETRY && canRetry(job, retry)) {
                    const delay = (_g = RETRY_DELAYS_MS[retry]) !== null && _g !== void 0 ? _g : 30000;
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
                    const ok = ch.sendToQueue(`${rabbit_1.QUEUE}_delay_${delay}ms`, msg.content, {
                        persistent: true,
                        headers: setFlow(Object.assign(Object.assign({}, headers), { "x-retry": retry + 1 }), flow),
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
        }), { noAck: false, consumerTag: `worker-${process.pid}` });
    });
}
exports.startWorker = startWorker;
// self start
startWorker().catch((err) => {
    console.error("[HIRS] crash:", err);
    process.exit(1);
});
