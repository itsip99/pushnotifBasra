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
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearCachedToken = exports.getCachedLsaToken = void 0;
const token_firebase_service_lsa_1 = require("./token_firebase_service_lsa");
let cachedToken = null;
let tokenExpiresAt = null;
function getCachedLsaToken() {
    return __awaiter(this, void 0, void 0, function* () {
        const now = Date.now();
        // kalau token masih valid ambil dari cache
        if (cachedToken && tokenExpiresAt && now < tokenExpiresAt) {
            return cachedToken;
        }
        // kalau belum ada token / expired ambil baru
        const token = yield (0, token_firebase_service_lsa_1.getAccessTokenLSA)();
        cachedToken = token;
        // token Google valid ~3600s, kita amanin jadi 55 menit
        tokenExpiresAt = now + (55 * 60 * 1000);
        return cachedToken;
    });
}
exports.getCachedLsaToken = getCachedLsaToken;
function clearCachedToken() {
    cachedToken = null;
    tokenExpiresAt = null;
}
exports.clearCachedToken = clearCachedToken;
