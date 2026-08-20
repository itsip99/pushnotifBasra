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
exports.getAccessTokenHIRS = void 0;
const { JWT } = require('google-auth-library');
const logger_1 = require("../../logger/logger");
const scopes = 'https://www.googleapis.com/auth/firebase.messaging';
function getAccessTokenHIRS() {
    return new Promise(function (resolve, reject) {
        return __awaiter(this, void 0, void 0, function* () {
            let key;
            try {
                key = require("./hris-mobile-flutter-bba9799773f1.json");
            }
            catch (err) {
                (0, logger_1.logErrorBlock)({ source: "getAccessTokenHIRS", type: "LOAD_JSON_FAIL", flow: ["GET_TOKEN", "LOAD_JSON", "FAIL"], error: (err === null || err === void 0 ? void 0 : err.message) || String(err) });
                reject(err);
                return;
            }
            const jwtClient = new JWT({
                email: key.client_email,
                key: key.private_key,
                scopes: scopes,
            });
            jwtClient.authorize(function (err, tokens) {
                if (err) {
                    (0, logger_1.logErrorBlock)({ source: "getAccessTokenHIRS", type: "JWT_AUTHORIZE_FAIL", flow: ["GET_TOKEN", "JWT_AUTHORIZE", "FAIL"], error: (err === null || err === void 0 ? void 0 : err.message) || String(err) });
                    reject(err);
                    return;
                }
                resolve(tokens.access_token);
            });
        });
    });
}
exports.getAccessTokenHIRS = getAccessTokenHIRS;
