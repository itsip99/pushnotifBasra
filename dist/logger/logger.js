"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loggerErrorFlutter = exports.logErrorBlock = exports.logInfoBlock = exports.loggerFile = exports.loggerSuccess = exports.logger = exports.myFormat = void 0;
const winston_1 = require("winston");
const moment_timezone_1 = __importDefault(require("moment-timezone"));
const winston_daily_rotate_file_1 = __importDefault(require("winston-daily-rotate-file"));
const { combine, timestamp, printf } = winston_1.format;
// Format log dengan timestamp Asia/Shanghai
exports.myFormat = printf(({ level, message, timestamp }) => {
    const formattedTimestamp = (0, moment_timezone_1.default)(`${timestamp}`).tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm');
    return `${formattedTimestamp} ${level}: ${message}`;
});
// Format timestamp untuk log harian
const timezoned = () => {
    return (0, moment_timezone_1.default)().tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm');
};
exports.logger = (0, winston_1.createLogger)({
    level: 'info',
    format: combine(timestamp({ format: timezoned }), exports.myFormat),
    transports: [
        new winston_1.transports.Console({
            format: combine(timestamp({ format: timezoned }), exports.myFormat),
        }),
        // hanya error → error log
        new winston_daily_rotate_file_1.default({
            filename: 'logs/error-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d'
        }),
        // info ke atas → request log (morgan)
        new winston_daily_rotate_file_1.default({
            filename: 'logs/request-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            level: 'info',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d'
        }),
    ]
});
exports.loggerSuccess = (0, winston_1.createLogger)({
    level: 'info',
    format: combine(timestamp({ format: timezoned }), exports.myFormat),
    transports: [
        new winston_1.transports.Console({
            format: combine(timestamp({ format: timezoned }), exports.myFormat),
        }),
        // Log untuk error
        new winston_daily_rotate_file_1.default({
            filename: 'logs/info-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            level: 'info',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d'
        }),
    ]
});
// file-only logger — tidak muncul di console, hanya masuk ke file
exports.loggerFile = (0, winston_1.createLogger)({
    level: 'info',
    format: combine(timestamp({ format: timezoned }), exports.myFormat),
    transports: [
        new winston_daily_rotate_file_1.default({
            filename: 'logs/request-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            level: 'info',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d'
        }),
    ]
});
// ─── Helper: cetak info dalam format blok ────────────────────────────────────
function logInfoBlock(payload) {
    const header = "========== HIRS DEVICE ==========";
    const footer = "=================================";
    const body = [
        payload.jobId ? `jobId     : ${payload.jobId}` : null,
        payload.userid ? `userid    : ${payload.userid}` : null,
        payload.numerator ? `numerator : ${payload.numerator}` : null,
        payload.pt ? `PT        : ${payload.pt}` : null,
        payload.jenis ? `jenis     : ${payload.jenis}` : null,
        payload.token ? `token     : ${payload.token}` : null,
        payload.title ? `title     : ${payload.title}` : null,
        `flow      : ${payload.flow.join(" -> ")}`,
        payload.extra ? `info      : ${payload.extra}` : null,
    ].filter(Boolean).join("\n");
    exports.loggerSuccess.info(`${header}\n${body}\n${footer}`);
}
exports.logInfoBlock = logInfoBlock;
// ─── Helper: cetak error dalam format blok ───────────────────────────────────
function logErrorBlock(payload) {
    const header = "========== HIRS ERROR ===========";
    const footer = "=================================";
    const body = [
        `source : ${payload.source}`,
        `type   : ${payload.type}`,
        payload.flow && payload.flow.length ? `flow   : ${payload.flow.join(" -> ")}` : null,
        `error  : ${payload.error}`,
        payload.meta ? `meta   : ${JSON.stringify(payload.meta)}` : null,
    ].filter(Boolean).join("\n");
    exports.logger.error(`${header}\n${body}\n${footer}`);
}
exports.logErrorBlock = logErrorBlock;
exports.loggerErrorFlutter = (0, winston_1.createLogger)({
    level: 'error',
    format: combine(timestamp({ format: timezoned }), exports.myFormat),
    transports: [
        new winston_1.transports.Console({
            format: combine(timestamp({ format: timezoned }), exports.myFormat),
        }),
        // Log untuk error
        new winston_daily_rotate_file_1.default({
            filename: 'logs/errorFlutterUser-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            level: 'info',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d'
        }),
    ]
});
