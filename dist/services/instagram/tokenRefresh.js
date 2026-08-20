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
exports.startInstagramTokenCron = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const axios_1 = __importDefault(require("axios"));
const tokenStore_1 = require("./tokenStore");
const logger_1 = require("../../logger/logger");
const REFRESH_BEFORE_DAYS = 10; // refresh kalau sisa < 10 hari
function refreshInstagramToken() {
    var _a, _b, _c;
    return __awaiter(this, void 0, void 0, function* () {
        const token = (0, tokenStore_1.readToken)();
        if (!token) {
            logger_1.logger.warn('[INSTAGRAM CRON] Token belum ada, skip refresh');
            return;
        }
        const expiredAt = new Date(token.expired_at);
        const diffMs = expiredAt.getTime() - Date.now();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays > REFRESH_BEFORE_DAYS) {
            logger_1.logger.info(`[INSTAGRAM CRON] Token masih aman | sisa: ${diffDays} hari`);
            return;
        }
        logger_1.logger.info(`[INSTAGRAM CRON] Token hampir expired (${diffDays} hari lagi), mulai refresh...`);
        try {
            const response = yield axios_1.default.get('https://graph.instagram.com/refresh_access_token', {
                params: {
                    grant_type: 'ig_refresh_token',
                    access_token: token.access_token,
                },
            });
            const { access_token, token_type, expires_in } = response.data;
            const newExpiredAt = new Date(Date.now() + expires_in * 1000);
            (0, tokenStore_1.saveToken)({ access_token, token_type, expires_in, expired_at: newExpiredAt.toISOString() });
            logger_1.logger.info(`[INSTAGRAM CRON] Token berhasil diperbarui | expired baru: ${newExpiredAt.toISOString()}`);
        }
        catch (error) {
            const errMsg = ((_c = (_b = (_a = error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) === null || _c === void 0 ? void 0 : _c.message) || error.message;
            logger_1.logger.error(`[INSTAGRAM CRON] Gagal refresh token: ${errMsg}`);
        }
    });
}
// Jalankan setiap hari pukul 01:00
function startInstagramTokenCron() {
    node_cron_1.default.schedule('0 1 * * *', () => __awaiter(this, void 0, void 0, function* () {
        yield refreshInstagramToken();
    }), { timezone: 'Asia/Jakarta' });
    logger_1.logger.info('[INSTAGRAM CRON] Scheduler aktif — cek token setiap hari pukul 01:00 WIB');
}
exports.startInstagramTokenCron = startInstagramTokenCron;
