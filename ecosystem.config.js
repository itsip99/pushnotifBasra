// Baca .env di sini (bukan di-hardcode ke bawah) supaya secret Instagram
// (client_secret dkk) TIDAK ikut ke-commit ke git -- ecosystem.config.js ini
// tracked, .env tidak. Proses Go (beda dari Node) tidak otomatis baca .env
// sendiri, jadi PM2-lah yang harus suntik env-nya lewat sini.
require('dotenv').config();

module.exports = {
  apps: [
    {
      name: "hris-api",
      script: "dist/index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      // RABBIT_URL wajib eksplisit: require("dotenv") di atas ikut memuat
      // RABBIT_URL dari .env (host.docker.internal, khusus Docker).
      env: { NODE_ENV: "production", RABBIT_URL: "amqp://admin:suryatimur@localhost" },
    },
    {
      name: "hris-worker",
      script: "dist/worker.hris.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      // RABBIT_URL wajib eksplisit: require("dotenv") di atas ikut memuat
      // RABBIT_URL dari .env (host.docker.internal, khusus Docker).
      env: { NODE_ENV: "production", RABBIT_URL: "amqp://admin:suryatimur@localhost" },
    },
    {
      name: "yamaha-worker",
      script: "dist/worker.yamaha.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      // RABBIT_URL wajib eksplisit: require("dotenv") di atas ikut memuat
      // RABBIT_URL dari .env (host.docker.internal, khusus Docker).
      env: { NODE_ENV: "production", RABBIT_URL: "amqp://admin:suryatimur@localhost" },
    },
    {
      name: "wellness-worker",
      script: "dist/worker.javawellness.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      // RABBIT_URL wajib eksplisit: require("dotenv") di atas ikut memuat
      // RABBIT_URL dari .env (host.docker.internal, khusus Docker).
      env: { NODE_ENV: "production", RABBIT_URL: "amqp://admin:suryatimur@localhost" },
    },
    {
      name: "lsa-worker",
      script: "dist/worker.lsa.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      // RABBIT_URL wajib eksplisit: require("dotenv") di atas ikut memuat
      // RABBIT_URL dari .env (host.docker.internal, khusus Docker).
      env: { NODE_ENV: "production", RABBIT_URL: "amqp://admin:suryatimur@localhost" },
    },
    {
      name: "fixupmoto-worker",
      script: "dist/worker.fixupmoto.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      // RABBIT_URL wajib eksplisit: require("dotenv") di atas ikut memuat
      // RABBIT_URL dari .env (host.docker.internal, khusus Docker).
      env: { NODE_ENV: "production", RABBIT_URL: "amqp://admin:suryatimur@localhost" },
    },

    // ─── Binary Go (menggantikan worker Node di atas setelah teruji) ─────
    // interpreter:"none" wajib -- bilang ke PM2 "ini bukan skrip Node,
    // jalankan langsung sebagai executable". instances>1 di sini TIDAK
    // pakai Node cluster (memang tidak relevan buat Go), PM2 cuma start
    // N proses independen -- pas untuk pola competing-consumer RabbitMQ.
    {
      name: "go-worker-hris",
      script: "./go/bin/worker-hris.exe",
      interpreter: "none",
      instances: 3, // <- ganti sesuai kebutuhan
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        RABBIT_URL: "amqp://admin:suryatimur@localhost",
        HRIS_FIREBASE_CREDENTIAL: "./go/credentials/hris-mobile-flutter-bba9799773f1.json",
      },
    },
    {
      name: "go-worker-wellness",
      script: "./go/bin/worker-wellness.exe",
      interpreter: "none",
      instances: 3,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        RABBIT_URL: "amqp://admin:suryatimur@localhost",
        WELLNESS_FIREBASE_CREDENTIAL: "./go/credentials/javawellness-3c6ad-firebase-adminsdk-fbsvc-e32ce697c8.json",
      },
    },
    {
      name: "go-worker-lsa",
      script: "./go/bin/worker-lsa.exe",
      interpreter: "none",
      instances: 3,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        RABBIT_URL: "amqp://admin:suryatimur@localhost",
        LSA_FIREBASE_CREDENTIAL: "./go/credentials/lsamobile-firebase-adminsdk-fbsvc-ada2a5477d.json",
      },
    },
    {
      name: "go-worker-javayoga",
      script: "./go/bin/worker-javayoga.exe",
      interpreter: "none",
      instances: 3,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        RABBIT_URL: "amqp://admin:suryatimur@localhost",
        JAVAYOGA_FIREBASE_CREDENTIAL: "./go/credentials/javayoga-f1963-firebase-adminsdk-lyt2d-9ebeeeacb7.json",
      },
    },
    {
      name: "go-worker-fixupmoto",
      script: "./go/bin/worker-fixupmoto.exe",
      interpreter: "none",
      instances: 3,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        RABBIT_URL: "amqp://admin:suryatimur@localhost",
        FIXUPMOTO_FIREBASE_CREDENTIAL: "./go/credentials/fixupmoto-service-account.json",
      },
    },

    // ─── API Go -- CUKUP 1 instance. Beda dari Node, 1 proses Go HTTP server
    // otomatis pakai SEMUA core CPU lewat goroutine (tidak butuh cluster/PM2 -i
    // untuk paralelisme kayak Node). Tidak perlu nginx/load balancer untuk ini.
    {
      name: "go-api",
      script: "./go/bin/api.exe",
      interpreter: "none",
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        // PORT_GO 5000 -- SAMA dengan port service-notif/hris-api (Node).
        // WAJIB service-notif & hris-api (Node) sudah di-stop DULU sebelum
        // go-api di-start/restart dengan port ini, kalau tidak akan gagal
        // bind port (EADDRINUSE) karena port sudah dipakai proses Node.
        PORT_GO: "5000",
        RABBIT_URL: "amqp://admin:suryatimur@localhost",
        HRIS_FIREBASE_CREDENTIAL: "./go/credentials/hris-mobile-flutter-bba9799773f1.json",
        LSA_FIREBASE_CREDENTIAL: "./go/credentials/lsamobile-firebase-adminsdk-fbsvc-ada2a5477d.json",
        WELLNESS_FIREBASE_CREDENTIAL: "./go/credentials/javawellness-3c6ad-firebase-adminsdk-fbsvc-e32ce697c8.json",
        BASRAMOBILE_FIREBASE_CREDENTIAL: "./go/credentials/basra-mobile-86f72-firebase-adminsdk-3nbag-ca009489f4.json",
        FIXUPMOTO_FIREBASE_CREDENTIAL: "./go/credentials/fixupmoto-service-account.json",
        JAVAYOGA_FIREBASE_CREDENTIAL: "./go/credentials/javayoga-f1963-firebase-adminsdk-lyt2d-9ebeeeacb7.json",
        // Instagram bukan Firebase credential -- diambil dari .env (lihat require('dotenv') di atas)
        INSTAGRAM_CLIENT_ID: process.env.INSTAGRAM_CLIENT_ID,
        INSTAGRAM_CLIENT_SECRET: process.env.INSTAGRAM_CLIENT_SECRET,
        INSTAGRAM_REDIRECT_URI: process.env.INSTAGRAM_REDIRECT_URI,
      },
    },
  ],
};
