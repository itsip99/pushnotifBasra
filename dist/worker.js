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
const hirsToken_1 = require("./services/hirs/hirsToken");
const hirs_1 = require("./controller/HIRS/hirs");
const logger_1 = require("./logger/logger");
const colors_1 = __importDefault(require("colors"));
const rabbit_1 = require("./config/rabbit");
function startWorker() {
    return __awaiter(this, void 0, void 0, function* () {
        const ch = yield (0, rabbit_1.getChannel)(); // ?? pakai instance yang sama
        console.log("?? Worker aktif. Listening queue:", rabbit_1.QUEUE);
        ch.consume(rabbit_1.QUEUE, (msg) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            if (!msg)
                return;
            const job = JSON.parse(msg.content.toString());
            const headers = ((_a = msg.properties) === null || _a === void 0 ? void 0 : _a.headers) || {};
            const retryCount = headers["x-retry"] || 0;
            try {
                const token = yield (0, hirsToken_1.getCachedHIRSToken)();
                yield (0, hirs_1.sendNotification)(job, token);
                logger_1.loggerSuccess.info(`HIRS | Notification sent | MetaData: ${JSON.stringify(job.metaData || {})}`);
                console.info(`${colors_1.default.green("HIRS")} | Success | token=${(_b = job === null || job === void 0 ? void 0 : job.message) === null || _b === void 0 ? void 0 : _b.token}`);
                ch.ack(msg);
            }
            catch (err) {
                const status = (_c = err === null || err === void 0 ? void 0 : err.response) === null || _c === void 0 ? void 0 : _c.status;
                const errMsg = (err === null || err === void 0 ? void 0 : err.message) || "Unknown";
                console.error(`? Worker Error: ${errMsg} | status=${status} | retry=${retryCount}`);
                // --- 401 token expired ? refresh
                if (status === 401) {
                    console.log("?? Token expired — refreshing token…");
                    (0, hirsToken_1.clearCachedToken)();
                    try {
                        const newToken = yield (0, hirsToken_1.getCachedHIRSToken)();
                        yield (0, hirs_1.sendNotification)(job, newToken);
                        console.log("? Resend success after token refresh");
                        ch.ack(msg);
                        return;
                    }
                    catch (_d) {
                        console.log("? Retry after refresh failed. Continue retry logic…");
                    }
                }
                // --- 404 token invalid ? stop retry
                if (status === 404) {
                    console.log("?? 404 — Token invalid. ACK & stop retry.");
                    ch.ack(msg);
                    return;
                }
                // --- Retry max 3x
                if (retryCount < 3) {
                    console.log(`? Retry ${retryCount + 1}/3`);
                    ch.sendToQueue(rabbit_1.QUEUE, Buffer.from(msg.content), { headers: { "x-retry": retryCount + 1 }, persistent: true });
                    ch.ack(msg);
                    return;
                }
                // --- Drop after 3x
                console.log("?? Max retry reached — dropping message.");
                ch.ack(msg);
            }
        }), {
            noAck: false,
            consumerTag: `worker-${process.pid}`
        });
    });
}
startWorker().catch(err => console.error("Worker crashed:", err));
