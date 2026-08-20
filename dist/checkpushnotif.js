const axios = require("axios");
const cron = require("node-cron");

let isRunning = false;
let lastRunDate = null;

const employeeIds = [
  "0305/000268",
  "2309/504253",
  "0907/001216"
];

cron.schedule(
  "0 8 * * *",
  async () => {
    const today = new Date().toDateString();

    if (lastRunDate === today) {
      console.log("Sudah jalan hari ini");
      return;
    }

    if (isRunning) {
      console.log("Masih proses sebelumnya");
      return;
    }

    isRunning = true;

    try {
      console.log("Trigger API jam 08:00 WIB");

      for (const id of employeeIds) {
        try {
          console.log(`Kirim ke ${id}`);

          const res = await axios.post(
            "https://wsip.yamaha-jatim.co.id:2447/HRIS/Misc/CekPushNotif",
            {
              employeeID: id,
            },
            {
              timeout: 10000,
            }
          );

          console.log(`Success ${id}:`, res.data);
        } catch (err) {
          console.error(
            `Error ${id}:`,
            err.response?.data || err.message
          );
        }
      }

      lastRunDate = today;

      console.log("Selesai semua request");
    } catch (err) {
      console.error("Fatal Error:", err.message);
    } finally {
      isRunning = false;
    }
  },
  {
    timezone: "Asia/Jakarta",
  }
);

console.log("Worker checkpushnotif running (08:00 WIB)");