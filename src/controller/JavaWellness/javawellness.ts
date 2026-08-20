import { Request, Response } from 'express';
import axios from "axios";
import l from "lodash";
import color from 'colors';

import { getCachedJavaWellnessToken } from '../../services/javaWellness/javaWellnessToken';
import { logger, loggerSuccess } from '../../logger/logger';
import { WELLNESS_QUEUE, getChannel } from '../../config/rabbit';
import { fcmAgent } from '../../config/httpAgent';

const FCM_URL = "https://fcm.googleapis.com/v1/projects/javawellness-3c6ad/messages:send";

const handleError = (res: Response, error: any, token: string) => {
    if (error.response && error.response.data && error.response.data.error) {
        const firebaseErrorMessage = error.response.data.error.message;
        const errorMessage = firebaseErrorMessage === 'Requested entity was not found.'
            ? 'Device Token not Found'
            : firebaseErrorMessage;

        console.error(` ${color.green('WELLNESS')}  | status: ${color.red(errorMessage)} || token/topic: ${token}`);
        logger.error(`WELLNESS  | status: Failed | Firebase-error: ${errorMessage} || TokenTo/Topic: ${token}`);

        res.status(200).json({
            meta: {
                code: 200,
                status: 'Failed',
                messages: `Error sending notification: ${errorMessage}`
            },
        });
    } else if (error.response) {
        logger.error(`WELLNESS | status: ${error.response} `);
        console.error(` ${color.green('WELLNESS')}  | status: ${color.red('Error sending notification')}`);

        res.status(error.response.status).json({
            meta: {
                code: 200,
                status: 'Failed',
                messages: 'Error sending notification'
            },
        });
    } else if (error.request) {
        logger.error(`WELLNESS | status: 500 | server Error `);
        console.error(` ${color.green('WELLNESS')}  | status: ${color.red('SERVER ERROR')}`);

        res.status(500).json({
            meta: {
                status: 500,
                messages: 'No response received from the server'
            },
        });
    } else {
        res.status(500).json({
            meta: {
                status: 500,
                messages: 'Error sending notification'
            },
        });
    }
};

export const sendNotificationbyTopic = async (req: Request, res: Response): Promise<void> => {
    const { to, notif, data } = req.body;

    if (l.isEmpty(to) || l.isEmpty(notif)) {
        res.status(400).json({
            'meta': {
                'status': 400,
                'messages': 'to atau data tidak boleh kosong'
            },
        });
        return;
    }

    const accessToken = await getCachedJavaWellnessToken();

    const message = {
        "message": {
            "topic": to,
            "notification": notif,
            "data": data
        }
    };

    try {
        const responseData = await axios.post(FCM_URL, JSON.stringify(message), {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            httpsAgent: fcmAgent
        })

        res.status(responseData.status).json({
            'meta': {
                'code': 100,
                'status': 'Success',
                'messages': 'Success sending notification'
            },
        });

        console.info(` ${color.green('WELLNESSFCM')}  | status: ${color.green('Success')}`);
        loggerSuccess.info('WELLNESS | Notification sent successfully:', responseData.data);

    } catch (error: any) {
        handleError(res, error, message.message.topic)
    }
};

function getTTLUntilMidnight(): number {
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
}

// sendNotificationbyDeviceToken push JOB LENGKAP (jobId/createdAt/ttlMs) ke
// WELLNESS_QUEUE -- beda dari LSA yang cuma push { message } polos, karena
// worker Wellness (worker.javawellness.ts) butuh createdAt/ttlMs buat
// expired()/canRetry().
export const sendNotificationbyDeviceToken = async (req: Request, res: Response): Promise<void> => {
    const { to, notif, data, metaData = {} } = req.body;

    if (l.isEmpty(to) || l.isEmpty(notif)) {
        res.status(400).json({
            meta: {
                status: 400,
                messages: "to atau notif tidak boleh kosong"
            },
        });
        return;
    }

    try {
        const ch = await getChannel();

        const createdAt = Date.now();
        const ttlMs = getTTLUntilMidnight();
        const jobId = `${createdAt}-${Math.random().toString(16).slice(2)}`;

        const job = {
            jobId,
            createdAt,
            ttlMs,
            metaData,
            message: { token: to, notification: notif, data },
        };

        const ok = ch.sendToQueue(WELLNESS_QUEUE, Buffer.from(JSON.stringify(job)), {
            persistent: true,
            contentType: "application/json",
            timestamp: createdAt,
            expiration: String(ttlMs),
            headers: {
                "x-retry": 0,
                "x-job-id": jobId,
            },
        });

        if (!ok) {
            logger.error(`WELLNESS | QUEUE_PUSH_FAIL | jobId=${jobId} | buffer penuh`);
            res.status(500).json({
                meta: { status: 500, messages: "Queue buffer penuh, coba lagi" }
            });
            return;
        }

        res.status(200).json({
            meta: {
                code: 100,
                status: "Success",
                messages: "Notification queued successfully",
                jobId,
            },
        });

        console.info(`${color.green("WELLNESSFCM")} | status: QUEUED | jobId=${jobId} | tokenTo=${to}`);
        loggerSuccess.info(`WELLNESS | Notification queued | jobId=${jobId} | MetaData: ${JSON.stringify(metaData || {})}`);

    } catch (error: any) {
        console.error("Queue push failed:", error?.message);
        res.status(500).json({
            meta: { status: 500, messages: "Failed to queue notification" }
        });
    }
};
