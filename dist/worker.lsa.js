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
// worker.lsa.ts
const axios_1 = __importDefault(require("axios"));
const colors_1 = __importDefault(require("colors"));
const rabbit_1 = require("./config/rabbit");
const lsaToken_1 = require("./services/lsa/lsaToken");
const FCM_URL = "https://fcm.googleapis.com/v1/projects/lsamobile/messages:send";
function safeJsonParse(buf) {
    try {
        return { ok: true, value: JSON.parse(buf.toString()) };
    }
    catch (_a) {
        return { ok: false };
    }
}
function isExpired(job) {
    if (!job.createdAt || !job.ttlMs)
        return false; // kalau job tidak pakai TTL, skip
    return Date.now() > job.createdAt + job.ttlMs;
}
function isNonRetryable(err) {
    var _a, _b, _c;
    const msg = ((_c = (_b = (_a = err === null || err === void 0 ? void 0 : err.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) === null || _c === void 0 ? void 0 : _c.message) || "";
    return (msg.includes("UNREGISTERED") ||
        msg.includes("registration-token-not-registered") ||
        msg.includes("Requested entity was not found"));
}
function sendToFcm(job, token) {
    return __awaiter(this, void 0, void 0, function* () {
        return axios_1.default.post(FCM_URL, { message: job.message }, {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            timeout: 15000,
        });
    });
}
function startLsaWorker() {
    return __awaiter(this, void 0, void 0, function* () {
        const ch = yield (0, rabbit_1.getChannel)();
        yield ch.assertQueue(rabbit_1.LSA_QUEUE, { durable: true });
        ch.prefetch(5);
        console.log(`LSA worker ready. Queue: ${rabbit_1.LSA_QUEUE}`);
        ch.consume(rabbit_1.LSA_QUEUE, (msg) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            if (!msg)
                return;
            const headers = ((_a = msg.properties) === null || _a === void 0 ? void 0 : _a.headers) || {};
            const retry = Number((_b = headers["x-retry"]) !== null && _b !== void 0 ? _b : 0);
            const maxRetry = 3;
            const parsed = safeJsonParse(msg.content);
            if (!parsed.ok) {
                console.error("[LSA] invalid JSON -> ack drop");
                ch.ack(msg);
                return;
            }
            const job = parsed.value;
            if (isExpired(job)) {
                console.warn(`[LSA] expired job -> ack drop token=${(_c = job === null || job === void 0 ? void 0 : job.message) === null || _c === void 0 ? void 0 : _c.token}`);
                ch.ack(msg);
                return;
            }
            try {
                const token = yield (0, lsaToken_1.getCachedLsaToken)();
                yield sendToFcm(job, token);
                console.log(`${colors_1.default.green("LSA")} | Success | ${job.message.token}`);
                ch.ack(msg);
            }
            catch (e) {
                const status = (_d = e === null || e === void 0 ? void 0 : e.response) === null || _d === void 0 ? void 0 : _d.status;
                // 401: refresh token once then retry
                if (status === 401) {
                    (0, lsaToken_1.clearCachedToken)();
                    try {
                        const newToken = yield (0, lsaToken_1.getCachedLsaToken)();
                        yield sendToFcm(job, newToken);
                        console.log(`${colors_1.default.green("LSA")} | Success (after token refresh) | ${job.message.token}`);
                        ch.ack(msg);
                        return;
                    }
                    catch (_j) {
                        // continue to retry flow
                    }
                }
                const firebaseMsg = ((_g = (_f = (_e = e === null || e === void 0 ? void 0 : e.response) === null || _e === void 0 ? void 0 : _e.data) === null || _f === void 0 ? void 0 : _f.error) === null || _g === void 0 ? void 0 : _g.message) || (e === null || e === void 0 ? void 0 : e.message) || "Unknown";
                console.error(`[LSA] fail status=${status} retry=${retry} token=${(_h = job === null || job === void 0 ? void 0 : job.message) === null || _h === void 0 ? void 0 : _h.token} msg=${firebaseMsg}`);
                // invalid device token -> stop retry
                if (status === 404 || isNonRetryable(e)) {
                    ch.ack(msg);
                    return;
                }
                // retry
                if (retry < maxRetry) {
                    const nextRetry = retry + 1;
                    const ok = ch.sendToQueue(rabbit_1.LSA_QUEUE, msg.content, {
                        persistent: true,
                        contentType: msg.properties.contentType,
                        timestamp: msg.properties.timestamp,
                        expiration: msg.properties.expiration,
                        headers: Object.assign(Object.assign({}, headers), { "x-retry": nextRetry }),
                    });
                    // kalau republish gagal jangan ack (biar ga lost)
                    if (!ok) {
                        console.warn("[LSA] buffer full -> NACK requeue");
                        ch.nack(msg, false, true);
                        return;
                    }
                    ch.ack(msg);
                    return;
                }
                // drop after max retry
                ch.ack(msg);
            }
        }), { noAck: false, consumerTag: `lsa-${process.pid}` });
    });
}
startLsaWorker().catch((err) => {
    console.error("[LSA] worker crash:", err);
    process.exit(1);
});
