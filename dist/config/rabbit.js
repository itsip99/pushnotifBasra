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
exports.getChannel = exports.LSA_QUEUE = exports.WELLNESS_QUEUE = exports.YAMAHA_QUEUE = exports.JAVA_QUEUE = exports.QUEUE = void 0;
const amqplib_1 = __importDefault(require("amqplib"));
const logger_1 = require("../logger/logger");
let connection = null;
let channel = null;
let connecting = null;
let channeling = null;
exports.QUEUE = "push_jobs";
exports.JAVA_QUEUE = "push_jobs_javayoga";
exports.YAMAHA_QUEUE = "push_jobs_yamaha";
exports.WELLNESS_QUEUE = "push_jobs_javawellness";
exports.LSA_QUEUE = "push_jobs_lsa";
const RABBIT_URL = process.env.RABBIT_URL || "amqp://admin:suryatimur@localhost";
function resetAll() {
    connection = null;
    channel = null;
    connecting = null;
    channeling = null;
}
function reconnectWithBackoff(attempt = 1) {
    return __awaiter(this, void 0, void 0, function* () {
        const delay = Math.min(1000 * 2 ** attempt, 30000); // max 30 detik
        logger_1.logger.info(`[RabbitMQ] reconnect dalam ${delay / 1000}s (attempt ${attempt})...`);
        yield new Promise(r => setTimeout(r, delay));
        try {
            yield getChannel();
            logger_1.logger.info("[RabbitMQ] reconnect berhasil");
        }
        catch (err) {
            logger_1.logger.error(`[RabbitMQ] reconnect gagal (attempt ${attempt}) | ${(err === null || err === void 0 ? void 0 : err.message) || err}`);
            reconnectWithBackoff(attempt + 1);
        }
    });
}
function getChannel() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!connection) {
            if (!connecting) {
                connecting = amqplib_1.default
                    .connect(RABBIT_URL, { heartbeat: 30 })
                    .then(conn => {
                    connection = conn;
                    connecting = null;
                    conn.on("error", err => {
                        logger_1.logger.error(`[RabbitMQ] connection error | ${err.message}`);
                        resetAll();
                        reconnectWithBackoff();
                    });
                    conn.on("close", () => {
                        logger_1.logger.error("[RabbitMQ] koneksi tertutup — mencoba reconnect...");
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
            yield connecting;
        }
        if (!channel) {
            if (!channeling) {
                channeling = connection
                    .createChannel()
                    .then((ch) => __awaiter(this, void 0, void 0, function* () {
                    yield ch.assertQueue(exports.QUEUE, { durable: true });
                    channel = ch;
                    channeling = null;
                    return ch;
                }))
                    .catch(err => {
                    channeling = null;
                    throw err;
                });
            }
            yield channeling;
        }
        return channel;
    });
}
exports.getChannel = getChannel;
