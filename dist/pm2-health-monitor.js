const axios = require("axios");
const { execSync } = require("child_process");

const WA_URL = "https://haryanto-agus-api.kirimwa.id/v1/messages";
const WA_TO = "ADMIN";

const REQUIRED = [
  "notif-gateway",
  "notif-worker-hris",
  "notif-worker-javayoga",
];

const CHECK_INTERVAL = 60 * 1000; // 1 minute

let lastErrorState = false;

function getPm2List() {
  const out = execSync("pm2 jlist", { encoding: "utf8" });
  return JSON.parse(out);
}

function checkStatus() {
  const list = getPm2List();
  const map = new Map(list.map(p => [p.name, p.pm2_env?.status]));

  const results = REQUIRED.map(name => ({
    name,
    status: map.get(name) || "NOT_FOUND",
  }));

  const downServices = results.filter(r => r.status !== "online");
  const hasError = downServices.length > 0;

  console.log("==== PM2 Health Check ====");
  results.forEach(r => {
    console.log(`${r.name} -> ${r.status}`);
  });

  return { hasError, downServices };
}

async function sendWaAlert(downServices) {
  const message =
`?? PM2 ALERT
${new Date().toLocaleString()}

${downServices.map(s => `? ${s.name} (${s.status})`).join("\n")}`;

  await axios.post(WA_URL, {
    phone_number: "628165422030-1586146463",
    is_group_message: true,
    message: message,   
    device_id: "realme-tab",
    message_type: "text"
  },  {
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer Tb_3yl}VYq78qB^/NVWy0OXqgwPj0rTMhrU50qfG^@58~Hbt-enterprise",
    }
  });

  console.log("WA alert sent.");
}

async function monitor() {
  try {
    const { hasError, downServices } = checkStatus();

    if (hasError && !lastErrorState) {
      await sendWaAlert(downServices);
      lastErrorState = true;
    }

    if (!hasError) {
      lastErrorState = false;
    }

  } catch (err) {
    console.error("Monitor error:", err.message);
  }
}

console.log("PM2 Health Monitor Started...");
setInterval(monitor, CHECK_INTERVAL);