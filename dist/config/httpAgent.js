"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fcmAgent = void 0;
const https_1 = __importDefault(require("https"));
// Shared keep-alive agent untuk semua request axios ke FCM.
// Tanpa ini, axios pakai https.globalAgent yang defaultnya keepAlive: false
// -- tiap request buka koneksi TCP+TLS baru ke fcm.googleapis.com.
// Dipakai bersama (bukan bikin instance baru per file/request) supaya
// koneksi yang sudah dibuka benar-benar bisa dipakai ulang.
exports.fcmAgent = new https_1.default.Agent({
    keepAlive: true,
    maxSockets: 50,
    maxFreeSockets: 10,
});
