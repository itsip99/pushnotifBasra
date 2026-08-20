import express, { Request, Response, response } from 'express';
import axios from "axios";
import l from "lodash";
import { getAccessTokenSPKbasra } from '../../services/SPKBasra/token_firebase_service_spkBasra';
import color from 'colors';
import { logger } from '../../logger/logger';
import { fcmAgent } from '../../config/httpAgent';



const handleError = (res: Response, error: any, token: string) => {
    if (error.response && error.response.data && error.response.data.error) {
        const firebaseErrorMessage = error.response.data.error.message;
        const errorMessage = firebaseErrorMessage === 'Requested entity was not found.'
            ? 'Device Token not Found'
            : firebaseErrorMessage;

        console.error(` ${color.green('SPKBASRA')}  | status: ${color.red(errorMessage)} || token/topic: ${token}`);
        logger.error(`SPKBASRA  | status: Failed | Firebase-error: ${errorMessage} || TokenTo/Topic: ${token}`);

        res.status(200).json({
            meta: {
                code: 200,
                status: 'Failed',
                messages: `Error sending notification: ${errorMessage}`
            },
        });
    } else if (error.response) {
        logger.error(`SPKBASRA | status: ${error.response} `);
        console.error(` ${color.green('SPKBASRA')}  | status: ${color.red('Error sending notification')}`);

        res.status(error.response.status).json({
            meta: {
                code: 200,
                status: 'Failed',
                messages: 'Error sending notification'
            },
        });
    } else if (error.request) {
        logger.error(`SPKBASRA | status: 500 | server Error `);
        console.error(` ${color.green('SPKBASRA')}  | status: ${color.red('SERVER ERROR')}`);

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
}


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
        const accessToken = await getAccessTokenSPKbasra();
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
            const responseData = await axios.post('https://fcm.googleapis.com/v1/projects/hris-mobile-flutter/messages:send', JSON.stringify(message), {
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

            console.error(` ${color.green('SPKBASRAFCM')}  | status: ${color.green('Success')}`);


            logger.info('Notification sent successfully:', responseData.data);

        } catch (error: any) {

            handleError(res,error,message.message.topic)

    }
};

}

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
        const accessToken = await getAccessTokenSPKbasra();

        // const topicName = 'industry-tech';

        const message = {

            "message": {
                "token": to,
                "notification": notif,
                "data": data
            }
        };

        try {
            const responseData = await axios.post('https://fcm.googleapis.com/v1/projects/hris-mobile-flutter/messages:send', JSON.stringify(message), {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                httpsAgent: fcmAgent
            })


            res.status(responseData.status).json({
                'meta': {
                    'status': responseData.status,
                    'messages': 'Success sending notification'
                },

            });

        } catch (error: any) {

            handleError(res,error,message.message.token)
        }
    }
};



