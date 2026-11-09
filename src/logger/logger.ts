import { format, createLogger, transports } from 'winston';
import moment from 'moment-timezone';
import DailyRotateFile from 'winston-daily-rotate-file';

const { combine, timestamp, printf } = format;

// Timestamp sudah dalam WIB dari timezoned(), jadi tidak perlu di-parse ulang
// dengan moment di sini (dulu dilakukan tiap baris log dan cukup mahal).
export const myFormat = printf(({ level, message, timestamp }) => {
    return `${timestamp} ${level}: ${message}`;
});

// Resolusi timestamp hanya per menit, jadi hasil moment-timezone di-cache
// dan baru dihitung ulang saat menit berganti.
let cachedMinute = -1;
let cachedTimestamp = '';
const timezoned = () => {
    const minute = Math.floor(Date.now() / 60000);
    if (minute !== cachedMinute) {
        cachedMinute = minute;
        cachedTimestamp = moment().tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm');
    }
    return cachedTimestamp;
};

export const logger = createLogger({
    level: 'info',
    format: combine(
        timestamp({ format: timezoned }),
        myFormat
    ),
    transports: [
        // format sudah diterapkan di level logger; tidak diulang di transport
        new transports.Console(),

        // hanya error → error log
        new DailyRotateFile({
            filename: 'logs/error-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d'
        }),

        // info ke atas → request log (morgan)
        new DailyRotateFile({
            filename: 'logs/request-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            level: 'info',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d'
        }),
    ]
});

export const loggerSuccess = createLogger({
    level: 'info',
    format: combine(
        timestamp({ format: timezoned }),
        myFormat
    ),
    transports: [
        // format sudah diterapkan di level logger; tidak diulang di transport
        new transports.Console(),

        // Log untuk error
        new DailyRotateFile({
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
export const loggerFile = createLogger({
    level: 'info',
    format: combine(
        timestamp({ format: timezoned }),
        myFormat
    ),
    transports: [
        new DailyRotateFile({
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
export function logInfoBlock(payload: {
    jobId?: string;
    userid?: string;
    numerator?: string;
    pt?: string;
    jenis?: string;
    token?: string;
    title?: string;
    flow: string[];
    extra?: string;
}) {
    const header = "========== HIRS DEVICE ==========";
    const footer = "=================================";
    const body = [
        payload.jobId     ? `jobId     : ${payload.jobId}`     : null,
        payload.userid    ? `userid    : ${payload.userid}`    : null,
        payload.numerator ? `numerator : ${payload.numerator}` : null,
        payload.pt        ? `PT        : ${payload.pt}`        : null,
        payload.jenis     ? `jenis     : ${payload.jenis}`     : null,
        payload.token     ? `token     : ${payload.token}`     : null,
        payload.title     ? `title     : ${payload.title}`     : null,
        `flow      : ${payload.flow.join(" -> ")}`,
        payload.extra     ? `info      : ${payload.extra}`     : null,
    ].filter(Boolean).join("\n");

    loggerSuccess.info(`${header}\n${body}\n${footer}`);
}

// ─── Helper: cetak error dalam format blok ───────────────────────────────────
export function logErrorBlock(payload: {
    source: string;
    type: string;
    error: string;
    flow?: string[];
    meta?: any;
}) {
    const header = "========== HIRS ERROR ===========";
    const footer = "=================================";
    const body = [
        `source : ${payload.source}`,
        `type   : ${payload.type}`,
        payload.flow && payload.flow.length ? `flow   : ${payload.flow.join(" -> ")}` : null,
        `error  : ${payload.error}`,
        payload.meta ? `meta   : ${JSON.stringify(payload.meta)}` : null,
    ].filter(Boolean).join("\n");

    logger.error(`${header}\n${body}\n${footer}`);
}

export const loggerErrorFlutter= createLogger({
    level: 'error',
    format: combine(
        timestamp({ format: timezoned }),
        myFormat
    ),
    transports: [
        // format sudah diterapkan di level logger; tidak diulang di transport
        new transports.Console(),

        // Log untuk error
        new DailyRotateFile({
            filename: 'logs/errorFlutterUser-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            level: 'info',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d'
        }),

       
    ]
});