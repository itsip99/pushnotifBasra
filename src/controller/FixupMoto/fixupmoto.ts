import express, { Request, Response, response } from 'express';
import axios from "axios";
import l from "lodash";

import { getAccessTokenFixUpMoto } from '../../services/fixupMoto/token_firebase_service_fixupMoto';
import { logger } from '../../logger/logger';
import color from 'colors';
import { fcmAgent } from '../../config/httpAgent';


const handleError = (res: Response, error: any, token: string) => {
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
        const accessToken = await getAccessTokenFixUpMoto();
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
            const responseData = await axios.post('https://fcm.googleapis.com/v1/projects/fixupmoto-5e9cb/messages:send', JSON.stringify(message), {
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
    } else {
        // Validation successful
        const accessToken = await getAccessTokenFixUpMoto();

        // const topicName = 'industry-tech';

        const message = {

            "message": {
                "token": to,
                "notification": notif,
                "data": data
            }
        };

        try {
            const responseData = await axios.post('https://fcm.googleapis.com/v1/projects/fixupmoto-5e9cb/messages:send', JSON.stringify(message), {
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

            console.error(` ${color.green('FIXUPMOTOFCM')}  | status: ${color.green('Success')}`);


            logger.info('Notification sent successfully:', responseData.data);

        } catch (error: any) {

            handleError(res, error,message.message.token)
        }
    }
};
