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
exports.startWellnessWorker = void 0;
const axios_1 = __importDefault(require("axios"));
const rabbit_1 = require("./config/rabbit");
const javaWellnessToken_1 = require("./services/javaWellness/javaWellnessToken");
const logger_1 = require("./logger/logger");
const FCM_URL = "https://fcm.googleapis.com/v1/projects/javawellness-3c6ad/messages:send";
const MAX_RETRY = 3;
const RETRY_DELAYS_MS = [5000, 15000, 30000];
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
function getFlow(headers) {
    const raw = headers === null || headers === void 0 ? void 0 : headers["x-flow"];
    if (!raw)
        return [];
    return String(raw).split("|").filter(Boolean);
}
function setFlow(headers, flow) {
    return Object.assign(Object.assign({}, headers), { "x-flow": flow.join("|") });
}
function canRetry(job, attempt) {
    var _a;
    const delay = (_a = RETRY_DELAYS_MS[attempt]) !== null && _a !== void 0 ? _a : 30000;
    if (!job.createdAt || !job.ttlMs)
        return true;
    const remaining = job.createdAt + job.ttlMs - Date.now();
    return remaining > delay + 10000;
}
function logBlock(level, payload) {
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
    if (level === "error")
        logger_1.logger.error(text);
    else
        logger_1.loggerSuccess.info(text);
}
function startWellnessWorker() {
    return __awaiter(this, void 0, void 0, function* () {
        const ch = yield (0, rabbit_1.getChannel)();
        ch.prefetch(10);
        yield ch.assertQueue(rabbit_1.WELLNESS_QUEUE, { durable: true });
        for (const delay of RETRY_DELAYS_MS) {
            yield ch.assertQueue(`${rabbit_1.WELLNESS_QUEUE}_delay_${delay}ms`, {
                durable: true,
                arguments: {
                    "x-message-ttl": delay,
                    "x-dead-letter-exchange": "",
                    "x-dead-letter-routing-key": rabbit_1.WELLNESS_QUEUE,
                },
            });
        }
        logger_1.logger.info(`[WELLNESS WORKER] listening: ${rabbit_1.WELLNESS_QUEUE}`);
        ch.consume(rabbit_1.WELLNESS_QUEUE, (msg) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            if (!msg)
                return;
            const headers = ((_a = msg.properties) === null || _a === void 0 ? void 0 : _a.headers) || {};
            const retry = Number((_b = headers["x-retry"]) !== null && _b !== void 0 ? _b : 0);
            const job = parseJob(msg.content);
            if (!job) {
                (0, logger_1.logErrorBlock)({ source: "wellnessWorker", type: "INVALID_JSON", flow: ["PROCESS", "INVALID_JSON"], error: "JSON rusak, ack drop" });
                ch.ack(msg);
                return;
            }
            const jobId = job.jobId || String(headers["x-job-id"] || "-");
            const userId = ((_c = job === null || job === void 0 ? void 0 : job.metaData) === null || _c === void 0 ? void 0 : _c.userid) || String(headers["x-userid"] || "-");
            const flow = getFlow(headers);
            if (flow.length === 0)
                flow.push("PROCESS");
            if (expired(job)) {
                flow.push("EXPIRED");
                logBlock("info", { jobId, userId, retry, flow });
                ch.ack(msg);
                return;
            }
            try {
                const token = yield (0, javaWellnessToken_1.getCachedJavaWellnessToken)();
                yield axios_1.default.post(FCM_URL, { message: job.message }, {
                    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                    timeout: 15000,
                });
                flow.push("SENT");
                logBlock("info", { jobId, userId, retry, flow });
                ch.ack(msg);
                return;
            }
            catch (e) {
                const status = (_d = e === null || e === void 0 ? void 0 : e.response) === null || _d === void 0 ? void 0 : _d.status;
                const message = errMsg(e);
                if (status === 401) {
                    (0, javaWellnessToken_1.clearCachedWellnessToken)();
                    try {
                        const newToken = yield (0, javaWellnessToken_1.getCachedJavaWellnessToken)();
                        yield axios_1.default.post(FCM_URL, { message: job.message }, {
                            headers: { Authorization: `Bearer ${newToken}`, "Content-Type": "application/json" },
                            timeout: 15000,
                        });
                        flow.push("SENT");
                        logBlock("info", { jobId, userId, retry, flow, status });
                        ch.ack(msg);
                        return;
                    }
                    catch (_f) {
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
                    const delay = (_e = RETRY_DELAYS_MS[retry]) !== null && _e !== void 0 ? _e : 30000;
                    flow.push("RETRY");
                    logBlock("error", { jobId, userId, retry, flow, status, message: `${message} — retry dalam ${delay / 1000}s` });
                    const ok = ch.sendToQueue(`${rabbit_1.WELLNESS_QUEUE}_delay_${delay}ms`, msg.content, {
                        persistent: true,
                        headers: setFlow(Object.assign(Object.assign({}, headers), { "x-retry": retry + 1 }), flow),
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
        }), { noAck: false, consumerTag: `wellness-${process.pid}` });
    });
}
exports.startWellnessWorker = startWellnessWorker;
startWellnessWorker().catch(err => {
    logger_1.logger.error(`[WELLNESS] worker crash: ${(err === null || err === void 0 ? void 0 : err.message) || err}`);
    process.exit(1);
});
