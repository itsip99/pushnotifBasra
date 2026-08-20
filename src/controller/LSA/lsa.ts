import express, { Request, Response } from 'express';
import { getCachedLsaToken } from '../../services/lsa/lsaToken';
import axios from "axios";
import l from "lodash";
import { logger, loggerSuccess } from '../../logger/logger';

import color from 'colors';
import { LSA_QUEUE, getChannel } from '../../config/rabbit';

const FCM_PROJECT_ID = 'lsamobile';

const handleError = (res: Response, error: any, token: string) => {
    if (error.response && error.response.data && error.response.data.error) {
        const firebaseErrorMessage = error.response.data.error.message;
        const errorMessage = firebaseErrorMessage === 'Requested entity was not found.'
            ? 'Device Token not Found'
            : firebaseErrorMessage;

        console.error(` ${color.green('LSA')}  | status: ${color.red(errorMessage)} || token/topic: ${token}`);
        logger.error(`LSA  | status: Failed | Firebase-error: ${errorMessage} || TokenTo/Topic: ${token}`);

        res.status(200).json({
            meta: {
                code: 200,
                status: 'Failed',
                messages: `Error sending notification: ${errorMessage}`
            },
        });
    } else if (error.response) {
        logger.error(`LSA | status: ${error.response} `);
        console.error(` ${color.green('LSA')}  | status: ${color.red('Error sending notification')}`);

        res.status(error.response.status).json({
            meta: {
                code: 200,
                status: 'Failed',
                messages: 'Error sending notification'
            },
        });
    } else if (error.request) {
        logger.error(`LSA | status: 500 | server Error `);
        console.error(` ${color.green('LSA')}  | status: ${color.red('SERVER ERROR')}`);

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
    } else {
        const accessToken = await getCachedLsaToken();

        const message = {
            "message": {
                "topic": to,
                "notification": notif,
                "data": data
            }
        };

        try {
            const responseData = await axios.post(`https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`, JSON.stringify(message), {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            res.status(responseData.status).json({
                'meta': {
                    'code': 100,
                    'status': 'Success',
                    'messages': 'Success sending notification'
                },
            });

            console.error(` ${color.green('LSAFCM')}  | status: ${color.green('Success')} `);

            logger.info('Notification sent successfully:', responseData.data);

        } catch (error: any) {

            handleError(res, error, message.message.topic)
        }
    }
};

export const sendNotificationbyDeviceToken = async (req: Request, res: Response): Promise<void> => {

    const { to, notif, data, metaData } = req.body;

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

        const job = { "message": { "token": to, "notification": notif, "data": data } };

        ch.sendToQueue(
            LSA_QUEUE,
            Buffer.from(JSON.stringify(job)),
            { persistent: true }
        );

        res.status(200).json({
            meta: {
                code: 100,
                status: "Success",
                messages: "Notification queued successfully"
            },
        });

        console.info(
            `${color.green("LSAFCM")} | status: QUEUED | tokenTo=${to}`
        );

        loggerSuccess.info(`LSA | Notification queued | MetaData: ${JSON.stringify(metaData || {})}`);

    } catch (error: any) {
        console.error("Queue push failed:", error?.message);
        res.status(500).json({
            meta: { status: 500, messages: "Failed to queue notification" }
        });
    }
};
