import axios from "axios";
import { Request, Response } from "express";
import l from "lodash";

import { getCachedHIRSToken } from "../../services/hirs/hirsToken";
import { NotificationJob } from "../../models/notificationJob.model";
import { QUEUE, getChannel } from "../../config/rabbit";
import { fcmAgent } from "../../config/httpAgent";
import { logger, loggerSuccess, loggerFile, logErrorBlock, logInfoBlock } from "../../logger/logger";

const FCM_URL = "https://fcm.googleapis.com/v1/projects/hris-mobile-flutter/messages:send";

function maskToken(token: string): string {
  if (!token || token.length < 10) return token;
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

const validateRequest = (req: Request, res: Response, requiredFields: string[]): boolean => {
  for (const field of requiredFields) {
    if (l.isEmpty(req.body[field])) {
      logErrorBlock({ source: "validateRequest", type: "VALIDATE_FAIL", flow: ["REQUEST_IN", "VALIDATE_FAIL"], error: `field '${field}' kosong`, meta: req.body });
      res.status(400).json({
        meta: { statusCode: 400, messages: `${field} tidak boleh kosong` },
      });
      return false;
    }
  }
  return true;
};

// helper generic call FCM v1
const sendNotificationFcm = async (payload: any, accessToken: string) => {
  return axios.post(FCM_URL, payload, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    timeout: 15000,
    httpsAgent: fcmAgent,
  });
};

// for worker (job queue)
export const sendNotification = async (job: NotificationJob, accessToken: string) => {
  return sendNotificationFcm({ message: job.message }, accessToken);
};

export const handleError = (res: Response, error: any, metaData: any) => {
  const safeMetaData = metaData || {};
  const firebaseMsg = error?.response?.data?.error?.message;

  if (firebaseMsg) {
    logErrorBlock({ source: "handleError", type: "firebase_error", flow: ["REQUEST_IN", "GET_TOKEN", "HIT_FCM", "FIREBASE_ERROR"], error: firebaseMsg, meta: safeMetaData });
    res.status(200).json({
      meta: { status: 200, messages: `Error sending notification: ${firebaseMsg}` },
      metaData: safeMetaData,
    });
    return;
  }

  if (error?.response) {
    logErrorBlock({ source: "handleError", type: "http_error", flow: ["REQUEST_IN", "GET_TOKEN", "HIT_FCM", "HTTP_ERROR"], error: `http_status=${error.response.status} | ${error?.message || ""}`, meta: safeMetaData });
    res.status(200).json({
      meta: { status: 200, messages: "Error sending notification" },
      metaData: safeMetaData,
    });
    return;
  }

  if (error?.request) {
    logErrorBlock({ source: "handleError", type: "no_response", flow: ["REQUEST_IN", "GET_TOKEN", "HIT_FCM", "NO_RESPONSE"], error: error?.message || String(error), meta: safeMetaData });
    res.status(500).json({
      meta: { status: 500, messages: "No response received from the server" },
      metaData: safeMetaData,
    });
    return;
  }

  logErrorBlock({ source: "handleError", type: "unexpected", flow: ["REQUEST_IN", "UNEXPECTED_ERROR"], error: error?.message || String(error), meta: safeMetaData });
  res.status(500).json({
    meta: { status: 500, messages: "Error sending notification" },
    metaData: safeMetaData,
  });
};

export const sendLoggingError = (_req: Request, res: Response): void => {
  res.status(200).json({ success: true, message: "Received" });
};

export const sendNotificationbyTopic = async (req: Request, res: Response): Promise<void> => {
  const { to, notif, data = {}, userid, msg } = req.body;
  const metaData = { userid, token: to, msg };

  logger.info(`[HIRS] TOPIC_REQUEST_IN | userid=${userid || "-"} | topic=${to || "-"} | title=${notif?.title || "-"}`);

  if (!validateRequest(req, res, ["to", "notif"])) return;

  try {
    const accessToken = await getCachedHIRSToken();
    logger.info(`[HIRS] TOPIC_TOKEN_OK | userid=${userid || "-"} | topic=${to || "-"}`);

    const payload = {
      message: {
        topic: String(to || "").trim(),
        notification: notif,
        data,
      },
    };

    const responseData = await sendNotificationFcm(payload, accessToken);

    loggerSuccess.info(`[HIRS] TOPIC_FCM_SENT | http=${responseData.status} | userid=${userid || "-"} | topic=${to || "-"} | title=${notif?.title || "-"}`);

    res.status(responseData.status).json({
      meta: { status: responseData.status, messages: "Success sending notification" },
      metaData,
    });
  } catch (error: any) {
    logErrorBlock({ source: "sendNotificationbyTopic", type: "FCM_ERROR", flow: ["REQUEST_IN", "GET_TOKEN", "HIT_FCM", "ERROR"], error: error?.response?.data?.error?.message || error?.message || String(error), meta: { userid, topic: to } });
    handleError(res, error, metaData);
  }
};


function getTTLUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

export const sendNotificationbyDeviceToken = async (req: Request, res: Response): Promise<void> => {
  const { to, notif, data = {}, metaData = {}, jenis } = req.body;

  const userid = metaData?.userid || req.body?.userid || "-";
  const numerator = metaData?.Numerator || metaData?.numerator || "-";
  const pt = metaData?.PT || metaData?.pt || "-";
  const jenisLog = jenis || metaData?.jenis || "sendingNotifbyDeviceToken";
  const tokenMasked = maskToken(String(to || ""));

  loggerFile.info(`[HIRS] DEVICE_REQUEST_BODY | ${JSON.stringify(req.body)}`);

  if (!validateRequest(req, res, ["to", "notif"])) return;

  const flow: string[] = ["REQUEST_IN"];

  try {
    const ch = await getChannel();
    flow.push("CHANNEL_OK");

    const createdAt = Date.now();
    const ttlMs = getTTLUntilMidnight();
    const jobId = `${createdAt}-${Math.random().toString(16).slice(2)}`;

    const job: NotificationJob = {
      jobId,
      createdAt,
      ttlMs,
      metaData: {
        ...(metaData || {}),
        jenis: jenis || metaData?.jenis || "sendingNotifbyDeviceToken",
      },
      message: {
        android: {
          priority: "high",
          notification: {
            sound: "announcement.mp3",
            channel_id: "high_importance_channel_v2",
          },
        },
        apns: {
          payload: { aps: {} },
          headers: { "mutable-content": "1" },
          fcm_options: {},
        },
        token: String(to || "").trim(),
        notification: { ...notif },
        data,
      },
    };

    const ok = ch.sendToQueue(QUEUE, Buffer.from(JSON.stringify(job)), {
      persistent: true,
      contentType: "application/json",
      timestamp: createdAt,
      expiration: String(ttlMs),
      headers: {
        "x-retry": 0,
        "x-job-id": jobId,
        "x-userid": job?.metaData?.userid || "",
        "x-jenis": job?.metaData?.jenis || "",
        "x-created-at": createdAt,
        "x-ttl-ms": ttlMs,
      },
    });

    if (!ok) {
      logErrorBlock({ source: "sendNotificationbyDeviceToken", type: "QUEUE_PUSH_FAIL", flow: ["REQUEST_IN", "GET_CHANNEL", "QUEUE_PUSH_FAIL"], error: "RabbitMQ buffer penuh", meta: { jobId, userid, numerator, PT: pt, token: tokenMasked } });
      res.status(500).json({
        meta: { status: 500, messages: "Queue buffer penuh, coba lagi" },
      });
      return;
    }

    flow.push("QUEUE_PUSH_OK");
    logInfoBlock({ jobId, userid, numerator, pt, jenis: jenisLog, token: tokenMasked, title: notif?.title, flow });

    res.status(200).json({
      meta: {
        code: 100,
        status: "Success",
        messages: "Notification queued successfully",
        jobId,
      },
    });
  } catch (error: any) {
    logErrorBlock({ source: "sendNotificationbyDeviceToken", type: "DEVICE_ERROR", flow: ["REQUEST_IN", "GET_CHANNEL", "ERROR"], error: error?.message || String(error), meta: { userid, numerator, PT: pt, token: tokenMasked } });
    handleError(res, error, metaData);
  }
};
