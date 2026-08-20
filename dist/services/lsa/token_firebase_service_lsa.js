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
exports.getAccessTokenLSA = void 0;
const { JWT } = require('google-auth-library');
const scopes = 'https://www.googleapis.com/auth/firebase.messaging';
// TODO: taruh service account JSON asli LSA di folder ini dengan nama file
// "lsa-firebase-adminsdk.json" (Firebase Console -> Project Settings ->
// Service Accounts -> Generate new private key), lalu sesuaikan nama file
// di require() di bawah kalau nama file aslinya berbeda.
function getAccessTokenLSA() {
    return new Promise(function (resolve, reject) {
        return __awaiter(this, void 0, void 0, function* () {
            const key = require("../lsa/lsamobile-firebase-adminsdk-fbsvc-ada2a5477d.json");
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
exports.getAccessTokenLSA = getAccessTokenLSA;
