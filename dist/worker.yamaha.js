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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startYamahaWorker = void 0;
const axios_1 = __importDefault(require("axios"));
const rabbit_1 = require("./config/rabbit");
const logger_1 = require("./logger/logger");
const YAMAHA_URL = "https://wsip.yamaha-jatim.co.id:2447/HRIS/Misc/ModifyLPushNotif";
const MAX_RETRY = 10;
const RETRY_DELAYS_MS = [5000, 10000, 15000, 30000, 60000]; // max 60 detik per attempt
function parseJob(buf) {
    try {
        return JSON.parse(buf.toString());
    }
    catch (_a) {
        return null;
    }
}
function expired(job) {
    if (!job.createdAt || !job.ttlMs)
        return false;
    return Date.now() > job.createdAt + job.ttlMs;
}
function getDelay(attempt) {
    return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
}
function canRetry(job, attempt) {
    if (!job.createdAt || !job.ttlMs)
        return true; // kalau tidak ada TTL, selalu retry
    const delay = getDelay(attempt);
    const remaining = job.createdAt + job.ttlMs - Date.now();
    return remaining > delay + 10000;
}
function logBlock(level, payload) {
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
    if (level === "error")
        logger_1.logger.error(text);
    else
        logger_1.loggerSuccess.info(text);
}
function callYamahaApi(job) {
    var _a, _b, _c, _d;
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield axios_1.default.post(YAMAHA_URL, { Jenis: job.Jenis, PT: job.PT, Numerator: job.Numerator }, { headers: { "Content-Type": "application/json" }, timeout: 15000 });
        const resultMessage = ((_c = (_b = (_a = response.data) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.resultMessage) || ((_d = response.data) === null || _d === void 0 ? void 0 : _d.msg);
        const raw = JSON.stringify(response.data);
        return { sukses: String(resultMessage || "").toUpperCase() === "SUKSES", raw };
    });
}
function startYamahaWorker() {
    return __awaiter(this, void 0, void 0, function* () {
        const ch = yield (0, rabbit_1.getChannel)();
        yield ch.assertQueue(rabbit_1.YAMAHA_QUEUE, { durable: true });
        ch.prefetch(10);
        // Buat delay queues saat startup.
        // Cara kerja: pesan retry dikirim ke sini, bukan langsung ke push_jobs_yamaha.
        // RabbitMQ tahan pesan selama x-message-ttl ms, lalu otomatis pindah ke push_jobs_yamaha.
        // Worker tidak perlu sleep — slot prefetch langsung bebas setelah ack.
        for (const delay of RETRY_DELAYS_MS) {
            yield ch.assertQueue(`${rabbit_1.YAMAHA_QUEUE}_delay_${delay}ms`, {
                durable: true,
                arguments: {
                    "x-message-ttl": delay, // berapa lama pesan ditahan di sini
                    "x-dead-letter-exchange": "", // pakai default exchange
                    "x-dead-letter-routing-key": rabbit_1.YAMAHA_QUEUE, // setelah TTL habis, kirim ke push_jobs_yamaha
                },
            });
        }
        console.log("[YAMAHA WORKER] listening:", rabbit_1.YAMAHA_QUEUE);
        ch.consume(rabbit_1.YAMAHA_QUEUE, (msg) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            if (!msg)
                return;
            const headers = ((_a = msg.properties) === null || _a === void 0 ? void 0 : _a.headers) || {};
            const retry = Number((_b = headers["x-retry"]) !== null && _b !== void 0 ? _b : 0);
            // [1] Parse pesan — kalau JSON rusak langsung buang
            const job = parseJob(msg.content);
            if (!job) {
                logger_1.logger.error("LPUSHNOTIF invalid JSON -> ack drop");
                ch.ack(msg);
                return;
            }
            const jobId = job.jobId || String(headers["x-job-id"] || "-");
            const flow = ["QUEUE"];
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
                const { sukses, raw } = yield callYamahaApi(job);
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
            }
            catch (e) {
                const errMsg = ((_d = (_c = e === null || e === void 0 ? void 0 : e.response) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.msg) || (e === null || e === void 0 ? void 0 : e.message) || "Unknown";
                // [6] Error / bukan SUKSES — masuk retry
                if (retry < MAX_RETRY && canRetry(job, retry)) {
                    const delay = getDelay(retry);
                    flow.push("RETRY");
                    logBlock("error", { jobId, numerator: job.Numerator, pt: job.PT, jenis: job.Jenis, retry, flow, error: `${errMsg} | coba lagi dalam ${delay / 1000}s` });
                    // Kirim ke delay queue yang sesuai, bukan langsung ke push_jobs_yamaha.
                    // Pesan akan "tidur" di delay queue selama `delay` ms,
                    // lalu RabbitMQ otomatis pindahkan ke push_jobs_yamaha.
                    // x-retry di-increment agar attempt berikutnya tahu ini sudah retry ke berapa.
                    const ok = ch.sendToQueue(`${rabbit_1.YAMAHA_QUEUE}_delay_${delay}ms`, msg.content, {
                        persistent: true,
                        headers: Object.assign(Object.assign({}, headers), { "x-retry": retry + 1, "x-job-id": jobId }),
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
        }), { noAck: false, consumerTag: `yamaha-${process.pid}` });
    });
}
exports.startYamahaWorker = startYamahaWorker;
startYamahaWorker().catch(err => {
    console.error("LPUSHNOTIF worker crash:", err);
    process.exit(1);
});
