/**
 * Script pengujian otomatis push notifikasi HRIS
 * Jalankan: node scripts/test-fire.js
 *
 * ENV override (opsional):
 *   BASE_URL=http://localhost:8000   -> target server
 *   DEVICE_TOKEN=<token>             -> FCM device token
 *   COUNT=5                          -> jumlah request
 *   DELAY_MS=500                     -> jeda antar request (ms)
 */

const axios = require("axios");

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL || "http://203.201.175.81:5000";
const COUNT = Number(process.env.COUNT || 5);
const DELAY_MS = Number(process.env.DELAY_MS || 500);

// Ganti dengan device token yang valid, atau set via ENV
const DEVICE_TOKEN =
  process.env.DEVICE_TOKEN ||
  "dM8fOpmiSX6zwJiBc76B__:APA91bFKvptsu2AvIDcWLWVGePdycW6UXktCtMM95IhCi8BYusCVqPC4VuG_Dd2wcGW_DAbWVtY-t0D3VFrenoWe9ZzVIukzdZQ17CBgvyomHq8JCRRZwE0";

const PT = "STSJ";
const JENIS_NOTIF = "testingpushnotif";
const USER_ID = "2309/504253";
const NAVIGATE_TO = "";
// ────────────────────────────────────────────────────────────────────────────

function pad(n, len = 4) {
  return String(n).padStart(len, "1");
}

function buildNumerator(i) {
  // contoh: TEST-STSJ-0001, TEST-STSJ-0002, dst
  return `TEST-${PT}-${pad(i)}`;
}

function buildPayload(numerator) {
  return {
    jenis: "sendingNotifbyDeviceToken",
    to: DEVICE_TOKEN,
    metaData: {
      userid: USER_ID,
      msg: `Test notif ${numerator}`,
      Numerator: numerator,
      Jenis: JENIS_NOTIF,
      PT: PT,
    },
    notif: {
      title: `[TEST] PENGAJUAN ${numerator}`,
      body: `Pengujian otomatis - ${numerator} - PT ${PT}`,
    },
    data: {
      ptUser: PT,
      navigate_to: NAVIGATE_TO,
    },
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fireOne(i) {
  const numerator = buildNumerator(i);
  const payload = buildPayload(numerator);

  try {
    const res = await axios.post(`${BASE_URL}/hris/modify`, payload, {
      timeout: 10_000,
    });

    const jobId = res.data?.meta?.jobId || "-";
    console.log(
      `[${pad(i)}] OK   | numerator=${numerator} | jobId=${jobId} | http=${res.status}`
    );
    return { numerator, jobId, ok: true };
  } catch (err) {
    const status = err?.response?.status || "ERR";
    const msg = err?.response?.data?.meta?.messages || err.message;
    console.error(`[${pad(i)}] FAIL | numerator=${numerator} | http=${status} | ${msg}`);
    return { numerator, jobId: null, ok: false };
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log(`TARGET  : ${BASE_URL}/hris/modify`);
  console.log(`COUNT   : ${COUNT} request`);
  console.log(`DELAY   : ${DELAY_MS} ms`);
  console.log(`PT      : ${PT}`);
  console.log(`JENIS   : ${JENIS_NOTIF}`);
  console.log(`TOKEN   : ${DEVICE_TOKEN.slice(0, 20)}...`);
  console.log("=".repeat(60));

  const results = [];

  for (let i = 1; i <= COUNT; i++) {
    const r = await fireOne(i);
    results.push(r);
    if (i < COUNT) await sleep(DELAY_MS);
  }

  // ── Ringkasan ──
  const ok = results.filter((r) => r.ok);
  const fail = results.filter((r) => !r.ok);

  console.log("\n" + "=".repeat(60));
  console.log(`SELESAI | berhasil=${ok.length} | gagal=${fail.length}`);

  if (ok.length > 0) {
    const jobIds = ok.map((r) => `'${r.jobId}'`).join(", ");
    console.log("\n── Query untuk cek di DB ──────────────────────────────");
    console.log(
      `SELECT job_id, user_id, jenis, status, retry_count, error_message, created_at\n` +
      `FROM hris_notification_log\n` +
      `WHERE job_id IN (${jobIds})\n` +
      `ORDER BY created_at DESC;`
    );
    console.log("\n── Atau cek semua TEST hari ini ───────────────────────");
    console.log(
      `SELECT job_id, user_id, jenis, status, retry_count, error_message, created_at\n` +
      `FROM hris_notification_log\n` +
      `WHERE jenis = '${JENIS_NOTIF}'\n` +
      `  AND DATE(created_at) = CURDATE()\n` +
      `ORDER BY created_at DESC;`
    );
  }

  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("Script crash:", err.message);
  process.exit(1);
});
