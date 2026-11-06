import express, { Request, Response, response } from 'express';
import axios from "axios";
import l from "lodash";

import { FIXUPMOTO_FCM_URL } from '../../services/fixupMoto/token_firebase_service_fixupMoto';
import { getCachedFixUpMotoToken } from '../../services/fixupMoto/fixupMotoToken';
import { logger, loggerSuccess } from '../../logger/logger';
import color from 'colors';
import { fcmAgent } from '../../config/httpAgent';
import { FIXUPMOTO_QUEUE, getChannel } from '../../config/rabbit';

function maskToken(token: string): string {
    if (!token || token.length < 10) return token;
    return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

const handleError =(res: Response, error: any, token: string) => {
    if (error.response && error.response.data && error.response.data.error) {

       
        const firebaseErrorMessage = error.response.data.error.message;
        res.status(error.response.status).json({
            meta: {
                status: error.response.status,
                messages: `Error sending notification: ${firebaseErrorMessage}`
            },
        });

        logger.error(`FIXUPMOTTO | status: ${error.response.status} | TokenTo/Topic: ${token}`);
        console.error(`${color.red('FIXUPMOTTO')}  | status: ${firebaseErrorMessage}`);


    } else if (error.response) {
        res.status(error.response.status).json({
            meta: {
                status: error.response.status,
                messages: 'Error sending notification'
            },
        });
    } else if (error.request) {
        res.status(500).json({
            meta: {
                status: 500,
                messages: 'No response received from the server'
            },
        });
    } else {
        logger.error(`FIXUPMOTTO | status: 500 | server Error`);
        console.error(`${color.red('FIXUPMOTTO')}  | status: ${color.red('SERVER ERROR')}`);
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
    } else {
        // Validation successful
        const accessToken = await getCachedFixUpMotoToken();
        // console.log(accessToken)

        // const topicName = 'industry-tech';

        const message = {

            "message": {
                "topic": to,
                "notification": notif,
                "data": data
                // "android": {
                //     "notification": notif
                // }
            }
        };

        try {
            const responseData = await axios.post(FIXUPMOTO_FCM_URL, JSON.stringify(message), {
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

        } catch (error: any) {

            handleError(res, error,message.message.topic)

        }
    }
};

export const sendNotificationbyDeviceToken = async (req: Request, res: Response): Promise<void> => {
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

    try {
        const ch = await getChannel();

        // payload untuk worker.fixupmoto.ts
        const job = {
            "message": {
                "token": to,
                "notification": notif,
                "data": data
            }
        };

        // jobId ditaruh di header/properti AMQP, bukan di body, supaya format job
        // yang dibaca worker Go tetap sama; worker Node membacanya untuk pelacakan.
        const createdAt = Date.now();
        const jobId = `${createdAt}-${Math.random().toString(16).slice(2)}`;

        const ok = ch.sendToQueue(
            FIXUPMOTO_QUEUE,
            Buffer.from(JSON.stringify(job)),
            {
                persistent: true,
                contentType: "application/json",
                messageId: jobId,
                timestamp: createdAt,
                headers: { "x-retry": 0, "x-job-id": jobId, "x-created-at": createdAt },
            }
        );
        if (!ok) {
            // false = buffer channel penuh, pesan tetap dikirim setelah drain; bukan ditolak broker
            logger.warn(`[FIXUPMOTO] QUEUE_BUFFER_FULL | jobId=${jobId} | pesan tetap di-buffer`);
        }

        res.status(200).json({
            'meta': {
                'code': 100,
                'status': 'Success',
                'messages': 'Notification queued successfully'
            },
        });

        loggerSuccess.info(`[FIXUPMOTO] QUEUED | jobId=${jobId} | queue=${FIXUPMOTO_QUEUE} | token=${maskToken(String(to))}`);
    } catch (error: any) {
        logger.error(`FIXUPMOTTO | Queue push failed | ${error?.message}`);
        console.error("Queue push failed:", error?.message);
        res.status(500).json({
            meta: { status: 500, messages: "Failed to queue notification" }
        });
    }
};
