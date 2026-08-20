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
exports.sendNotificationbyDeviceToken = exports.sendNotificationbyTopic = exports.sendLoggingError = exports.handleError = exports.sendNotification = void 0;
const axios_1 = __importDefault(require("axios"));
const lodash_1 = __importDefault(require("lodash"));
const hirsToken_1 = require("../../services/hirs/hirsToken");
const rabbit_1 = require("../../config/rabbit");
const httpAgent_1 = require("../../config/httpAgent");
const logger_1 = require("../../logger/logger");
const FCM_URL = "https://fcm.googleapis.com/v1/projects/hris-mobile-flutter/messages:send";
function maskToken(token) {
    if (!token || token.length < 10)
        return token;
    return `${token.slice(0, 6)}...${token.slice(-4)}`;
}
const validateRequest = (req, res, requiredFields) => {
    for (const field of requiredFields) {
        if (lodash_1.default.isEmpty(req.body[field])) {
            (0, logger_1.logErrorBlock)({ source: "validateRequest", type: "VALIDATE_FAIL", flow: ["REQUEST_IN", "VALIDATE_FAIL"], error: `field '${field}' kosong`, meta: req.body });
            res.status(400).json({
                meta: { statusCode: 400, messages: `${field} tidak boleh kosong` },
            });
            return false;
        }
    }
    return true;
};
// helper generic call FCM v1
const sendNotificationFcm = (payload, accessToken) => __awaiter(void 0, void 0, void 0, function* () {
    return axios_1.default.post(FCM_URL, payload, {
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
        },
        timeout: 15000,
        httpsAgent: httpAgent_1.fcmAgent,
    });
});
// for worker (job queue)
const sendNotification = (job, accessToken) => __awaiter(void 0, void 0, void 0, function* () {
    return sendNotificationFcm({ message: job.message }, accessToken);
});
exports.sendNotification = sendNotification;
const handleError = (res, error, metaData) => {
    var _a, _b, _c;
    const safeMetaData = metaData || {};
    const firebaseMsg = (_c = (_b = (_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) === null || _c === void 0 ? void 0 : _c.message;
    if (firebaseMsg) {
        (0, logger_1.logErrorBlock)({ source: "handleError", type: "firebase_error", flow: ["REQUEST_IN", "GET_TOKEN", "HIT_FCM", "FIREBASE_ERROR"], error: firebaseMsg, meta: safeMetaData });
        res.status(200).json({
            meta: { status: 200, messages: `Error sending notification: ${firebaseMsg}` },
            metaData: safeMetaData,
        });
        return;
    }
    if (error === null || error === void 0 ? void 0 : error.response) {
        (0, logger_1.logErrorBlock)({ source: "handleError", type: "http_error", flow: ["REQUEST_IN", "GET_TOKEN", "HIT_FCM", "HTTP_ERROR"], error: `http_status=${error.response.status} | ${(error === null || error === void 0 ? void 0 : error.message) || ""}`, meta: safeMetaData });
        res.status(200).json({
            meta: { status: 200, messages: "Error sending notification" },
            metaData: safeMetaData,
        });
        return;
    }
    if (error === null || error === void 0 ? void 0 : error.request) {
        (0, logger_1.logErrorBlock)({ source: "handleError", type: "no_response", flow: ["REQUEST_IN", "GET_TOKEN", "HIT_FCM", "NO_RESPONSE"], error: (error === null || error === void 0 ? void 0 : error.message) || String(error), meta: safeMetaData });
        res.status(500).json({
            meta: { status: 500, messages: "No response received from the server" },
            metaData: safeMetaData,
        });
        return;
    }
    (0, logger_1.logErrorBlock)({ source: "handleError", type: "unexpected", flow: ["REQUEST_IN", "UNEXPECTED_ERROR"], error: (error === null || error === void 0 ? void 0 : error.message) || String(error), meta: safeMetaData });
    res.status(500).json({
        meta: { status: 500, messages: "Error sending notification" },
        metaData: safeMetaData,
    });
};
exports.handleError = handleError;
const sendLoggingError = (_req, res) => {
    res.status(200).json({ success: true, message: "Received" });
};
exports.sendLoggingError = sendLoggingError;
const sendNotificationbyTopic = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const { to, notif, data = {}, userid, msg } = req.body;
    const metaData = { userid, token: to, msg };
    logger_1.logger.info(`[HIRS] TOPIC_REQUEST_IN | userid=${userid || "-"} | topic=${to || "-"} | title=${(notif === null || notif === void 0 ? void 0 : notif.title) || "-"}`);
    if (!validateRequest(req, res, ["to", "notif"]))
        return;
    try {
        const accessToken = yield (0, hirsToken_1.getCachedHIRSToken)();
        logger_1.logger.info(`[HIRS] TOPIC_TOKEN_OK | userid=${userid || "-"} | topic=${to || "-"}`);
        const payload = {
            message: {
                topic: String(to || "").trim(),
                notification: notif,
                data,
            },
        };
        const responseData = yield sendNotificationFcm(payload, accessToken);
        logger_1.loggerSuccess.info(`[HIRS] TOPIC_FCM_SENT | http=${responseData.status} | userid=${userid || "-"} | topic=${to || "-"} | title=${(notif === null || notif === void 0 ? void 0 : notif.title) || "-"}`);
        res.status(responseData.status).json({
            meta: { status: responseData.status, messages: "Success sending notification" },
            metaData,
        });
    }
    catch (error) {
        (0, logger_1.logErrorBlock)({ source: "sendNotificationbyTopic", type: "FCM_ERROR", flow: ["REQUEST_IN", "GET_TOKEN", "HIT_FCM", "ERROR"], error: ((_c = (_b = (_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) === null || _c === void 0 ? void 0 : _c.message) || (error === null || error === void 0 ? void 0 : error.message) || String(error), meta: { userid, topic: to } });
        (0, exports.handleError)(res, error, metaData);
    }
});
exports.sendNotificationbyTopic = sendNotificationbyTopic;
function getTTLUntilMidnight() {
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
}
const sendNotificationbyDeviceToken = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _d, _e, _f;
    const { to, notif, data = {}, metaData = {}, jenis } = req.body;
    const userid = (metaData === null || metaData === void 0 ? void 0 : metaData.userid) || ((_d = req.body) === null || _d === void 0 ? void 0 : _d.userid) || "-";
    const numerator = (metaData === null || metaData === void 0 ? void 0 : metaData.Numerator) || (metaData === null || metaData === void 0 ? void 0 : metaData.numerator) || "-";
    const pt = (metaData === null || metaData === void 0 ? void 0 : metaData.PT) || (metaData === null || metaData === void 0 ? void 0 : metaData.pt) || "-";
    const jenisLog = jenis || (metaData === null || metaData === void 0 ? void 0 : metaData.jenis) || "sendingNotifbyDeviceToken";
    const tokenMasked = maskToken(String(to || ""));
    logger_1.loggerFile.info(`[HIRS] DEVICE_REQUEST_BODY | ${JSON.stringify(req.body)}`);
    if (!validateRequest(req, res, ["to", "notif"]))
        return;
    const flow = ["REQUEST_IN"];
    try {
        const ch = yield (0, rabbit_1.getChannel)();
        flow.push("CHANNEL_OK");
        const createdAt = Date.now();
        const ttlMs = getTTLUntilMidnight();
        const jobId = `${createdAt}-${Math.random().toString(16).slice(2)}`;
        const job = {
            jobId,
            createdAt,
            ttlMs,
            metaData: Object.assign(Object.assign({}, (metaData || {})), { jenis: jenis || (metaData === null || metaData === void 0 ? void 0 : metaData.jenis) || "sendingNotifbyDeviceToken" }),
            message: {
                android: {
                    priority: "high",
                    notification: {
                        sound: "announcement.mp3",
                        channel_id: "high_importance_channel_v2",
                    },
                },
                apns: {
                    payload: { aps: {} },
                    headers: { "mutable-content": "1" },
                    fcm_options: {},
                },
                token: String(to || "").trim(),
                notification: Object.assign({}, notif),
                data,
            },
        };
        const ok = ch.sendToQueue(rabbit_1.QUEUE, Buffer.from(JSON.stringify(job)), {
            persistent: true,
            contentType: "application/json",
            timestamp: createdAt,
            expiration: String(ttlMs),
            headers: {
                "x-retry": 0,
                "x-job-id": jobId,
                "x-userid": ((_e = job === null || job === void 0 ? void 0 : job.metaData) === null || _e === void 0 ? void 0 : _e.userid) || "",
                "x-jenis": ((_f = job === null || job === void 0 ? void 0 : job.metaData) === null || _f === void 0 ? void 0 : _f.jenis) || "",
                "x-created-at": createdAt,
                "x-ttl-ms": ttlMs,
            },
        });
        if (!ok) {
            (0, logger_1.logErrorBlock)({ source: "sendNotificationbyDeviceToken", type: "QUEUE_PUSH_FAIL", flow: ["REQUEST_IN", "GET_CHANNEL", "QUEUE_PUSH_FAIL"], error: "RabbitMQ buffer penuh", meta: { jobId, userid, numerator, PT: pt, token: tokenMasked } });
            res.status(500).json({
                meta: { status: 500, messages: "Queue buffer penuh, coba lagi" },
            });
            return;
        }
        flow.push("QUEUE_PUSH_OK");
        (0, logger_1.logInfoBlock)({ jobId, userid, numerator, pt, jenis: jenisLog, token: tokenMasked, title: notif === null || notif === void 0 ? void 0 : notif.title, flow });
        res.status(200).json({
            meta: {
                code: 100,
                status: "Success",
                messages: "Notification queued successfully",
                jobId,
            },
        });
    }
    catch (error) {
        (0, logger_1.logErrorBlock)({ source: "sendNotificationbyDeviceToken", type: "DEVICE_ERROR", flow: ["REQUEST_IN", "GET_CHANNEL", "ERROR"], error: (error === null || error === void 0 ? void 0 : error.message) || String(error), meta: { userid, numerator, PT: pt, token: tokenMasked } });
        (0, exports.handleError)(res, error, metaData);
    }
});
exports.sendNotificationbyDeviceToken = sendNotificationbyDeviceToken;
