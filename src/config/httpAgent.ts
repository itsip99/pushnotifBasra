import https from "https";

// Shared keep-alive agent untuk semua request axios ke FCM.
// Tanpa ini, axios pakai https.globalAgent yang defaultnya keepAlive: false
// -- tiap request buka koneksi TCP+TLS baru ke fcm.googleapis.com.
// Dipakai bersama (bukan bikin instance baru per file/request) supaya
// koneksi yang sudah dibuka benar-benar bisa dipakai ulang.
export const fcmAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
});
