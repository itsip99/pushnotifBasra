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
exports.instagramCallback = exports.getInstagramMedia = exports.getStoredToken = exports.exchangeLongLivedToken = void 0;
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const logger_1 = require("../../logger/logger");
const tokenStore_1 = require("../../services/instagram/tokenStore");
// Exchange short-lived token (1 jam) → long-lived token (60 hari), simpan ke file
const exchangeLongLivedToken = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    const { access_token, client_secret } = req.body;
    const secret = client_secret || process.env.INSTAGRAM_CLIENT_SECRET;
    if (!access_token) {
        res.status(400).json({
            meta: { status: 400, messages: 'access_token wajib diisi' },
        });
        return;
    }
    if (!secret) {
        res.status(400).json({
            meta: { status: 400, messages: 'client_secret wajib diisi (atau set INSTAGRAM_CLIENT_SECRET di .env)' },
        });
        return;
    }
    try {
        const response = yield axios_1.default.get('https://graph.instagram.com/access_token', {
            params: {
                grant_type: 'ig_exchange_token',
                client_secret: secret,
                access_token,
            },
        });
        const { access_token: longLivedToken, token_type, expires_in } = response.data;
        const expiredAt = new Date(Date.now() + expires_in * 1000);
        (0, tokenStore_1.saveToken)({ access_token: longLivedToken, token_type, expires_in, expired_at: expiredAt.toISOString() });
        logger_1.logger.info(`Instagram long-lived token disimpan | expired: ${expiredAt.toISOString()}`);
        res.status(200).json({
            meta: { status: 200, messages: 'Token berhasil diperbarui (60 hari) dan disimpan' },
            data: { access_token: longLivedToken, token_type, expires_in, expired_at: expiredAt.toISOString() },
        });
    }
    catch (error) {
        const errMsg = ((_c = (_b = (_a = error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) === null || _c === void 0 ? void 0 : _c.message) || error.message;
        logger_1.logger.error(`Instagram exchange long-lived token gagal: ${errMsg}`);
        res.status(((_d = error.response) === null || _d === void 0 ? void 0 : _d.status) || 500).json({
            meta: { status: ((_e = error.response) === null || _e === void 0 ? void 0 : _e.status) || 500, messages: `Gagal exchange token: ${errMsg}` },
        });
    }
});
exports.exchangeLongLivedToken = exchangeLongLivedToken;
// Ambil token yang tersimpan (untuk dipakai service lain)
const getStoredToken = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const token = (0, tokenStore_1.readToken)();
    if (!token) {
        res.status(404).json({ meta: { status: 404, messages: 'Token belum ada, panggil /long-lived-token dulu' } });
        return;
    }
    res.status(200).json({
        meta: { status: 200, messages: (0, tokenStore_1.isTokenExpired)() ? 'Token sudah expired!' : 'Token aktif' },
        data: Object.assign(Object.assign({}, token), { is_expired: (0, tokenStore_1.isTokenExpired)() }),
    });
});
exports.getStoredToken = getStoredToken;
// Fetch media posts dari Instagram menggunakan token tersimpan
const getInstagramMedia = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _f, _g, _h, _j, _k, _l;
    const token = (0, tokenStore_1.readToken)();
    if (!token) {
        res.status(404).json({ meta: { status: 404, messages: 'Token belum ada, panggil /long-lived-token dulu' } });
        return;
    }
    if ((0, tokenStore_1.isTokenExpired)()) {
        res.status(401).json({ meta: { status: 401, messages: 'Token sudah expired, perbarui token dulu' } });
        return;
    }
    try {
        const response = yield axios_1.default.get('https://graph.instagram.com/v25.0/me/media', {
            params: {
                fields: 'id,media_type,media_url,thumbnail_url,permalink,timestamp,caption',
                access_token: token.access_token,
            },
        });
        const media = response.data.data;
        logger_1.logger.info(`Instagram media fetched | total: ${media.length}`);
        res.status(200).json({
            meta: { status: 200, messages: 'Berhasil fetch media Instagram' },
            data: media,
            paging: (_f = response.data.paging) !== null && _f !== void 0 ? _f : null,
        });
    }
    catch (error) {
        const errMsg = ((_j = (_h = (_g = error.response) === null || _g === void 0 ? void 0 : _g.data) === null || _h === void 0 ? void 0 : _h.error) === null || _j === void 0 ? void 0 : _j.message) || error.message;
        logger_1.logger.error(`Instagram fetch media gagal: ${errMsg}`);
        res.status(((_k = error.response) === null || _k === void 0 ? void 0 : _k.status) || 500).json({
            meta: { status: ((_l = error.response) === null || _l === void 0 ? void 0 : _l.status) || 500, messages: `Gagal fetch media: ${errMsg}` },
        });
    }
});
exports.getInstagramMedia = getInstagramMedia;
const instagramCallback = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _m, _o, _p, _q;
    const { code, error, error_reason, error_description } = req.query;
    if (error) {
        logger_1.logger.error(`Instagram OAuth error: ${error_reason} - ${error_description}`);
        res.status(400).json({
            meta: {
                status: 400,
                messages: `Instagram OAuth denied: ${error_description}`,
            },
        });
        return;
    }
    if (!code) {
        res.status(400).json({
            meta: {
                status: 400,
                messages: 'Authorization code tidak ditemukan',
            },
        });
        return;
    }
    try {
        const form = new form_data_1.default();
        form.append('client_id', process.env.INSTAGRAM_CLIENT_ID || '');
        form.append('client_secret', process.env.INSTAGRAM_CLIENT_SECRET || '');
        form.append('grant_type', 'authorization_code');
        form.append('redirect_uri', process.env.INSTAGRAM_REDIRECT_URI || '');
        form.append('code', code);
        const response = yield axios_1.default.post('https://api.instagram.com/oauth/access_token', form, {
            headers: form.getHeaders(),
        });
        logger_1.logger.info(`Instagram OAuth success | user_id: ${response.data.user_id}`);
        res.status(200).json({
            meta: {
                status: 200,
                messages: 'Instagram OAuth berhasil',
            },
            data: {
                access_token: response.data.access_token,
                user_id: response.data.user_id,
            },
        });
    }
    catch (error) {
        const errMsg = ((_o = (_m = error.response) === null || _m === void 0 ? void 0 : _m.data) === null || _o === void 0 ? void 0 : _o.error_message) || error.message;
        logger_1.logger.error(`Instagram OAuth token exchange failed: ${errMsg}`);
        res.status(((_p = error.response) === null || _p === void 0 ? void 0 : _p.status) || 500).json({
            meta: {
                status: ((_q = error.response) === null || _q === void 0 ? void 0 : _q.status) || 500,
                messages: `Gagal tukar token: ${errMsg}`,
            },
        });
    }
});
exports.instagramCallback = instagramCallback;
