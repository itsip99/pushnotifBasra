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
exports.clearCachedWellnessToken = exports.getCachedJavaWellnessToken = void 0;
const token_firebase_service_javaWellness_1 = require("./token_firebase_service_javaWellness");
const logger_1 = require("../../logger/logger");
let cachedToken = null;
let tokenExpiresAt = null;
let refreshing = null;
function getCachedJavaWellnessToken() {
    return __awaiter(this, void 0, void 0, function* () {
        const now = Date.now();
        if (cachedToken && tokenExpiresAt && now < tokenExpiresAt) {
            return cachedToken;
        }
        if (!refreshing) {
            refreshing = (0, token_firebase_service_javaWellness_1.getAccessTokenJavaWellness)()
                .then(token => {
                cachedToken = token;
                tokenExpiresAt = Date.now() + 55 * 60 * 1000;
                refreshing = null;
                logger_1.logger.info(`[WELLNESS] getCachedJavaWellnessToken | token refreshed | expires in 55min`);
                return token;
            })
                .catch(err => {
                (0, logger_1.logErrorBlock)({ source: "getCachedJavaWellnessToken", type: "TOKEN_REFRESH_FAIL", flow: ["GET_TOKEN", "CALL_GOOGLE", "FAIL"], error: (err === null || err === void 0 ? void 0 : err.message) || String(err) });
                refreshing = null;
                throw err;
            });
        }
        return refreshing;
    });
}
exports.getCachedJavaWellnessToken = getCachedJavaWellnessToken;
function clearCachedWellnessToken() {
    cachedToken = null;
    tokenExpiresAt = null;
    refreshing = null;
}
exports.clearCachedWellnessToken = clearCachedWellnessToken;
