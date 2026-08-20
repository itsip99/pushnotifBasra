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
exports.getAccessTokenBasraMobile = void 0;
const { JWT } = require('google-auth-library');
const scopes = 'https://www.googleapis.com/auth/firebase.messaging';
function getAccessTokenBasraMobile() {
    return new Promise(function (resolve, reject) {
        return __awaiter(this, void 0, void 0, function* () {
            const key = require("./basra-mobile-86f72-firebase-adminsdk-3nbag-ca009489f4.json");
            const jwtClient = new JWT({
                email: key.client_email,
                key: key.private_key,
                scopes: scopes,
            });
            jwtClient.authorize(function (err, tokens) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(tokens.access_token);
            });
        });
    });
}
exports.getAccessTokenBasraMobile = getAccessTokenBasraMobile;
