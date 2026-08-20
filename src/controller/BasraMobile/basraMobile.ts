import express, { Request, Response, response } from 'express';
import axios from "axios";
import l from "lodash";
import color from 'colors';

import { getAccessTokenBasraMobile } from '../../services/BasraMobile/token_firebase_service_basraMobile';
import { logger } from '../../logger/logger';
import { fcmAgent } from '../../config/httpAgent';



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
        const accessToken = await getAccessTokenBasraMobile();
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
            const responseData = await axios.post('https://fcm.googleapis.com/v1/projects/basra-mobile-86f72/messages:send', JSON.stringify(message), {
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

            if (error.response && error.response.data && error.response.data.error) {
                // Mengambil pesan kesalahan dari respons Firebase
                const firebaseErrorMessage = error.response.data.error.message;

                console.error(`BasraMobile Error sending notification: ${firebaseErrorMessage}`);

                logger.error(`FixupMotto | status: ${error.response} Firebase-error:`, firebaseErrorMessage);



                res.status(200).json({
                    'meta': {
                        'code': 100,
                        'status': 'Failed',
                        'messages': `Error sending notification: ${firebaseErrorMessage}`
                    },
                });
            } else if (error.response) {
                // Kesalahan respons dari server (misalnya, status code tidak dalam rentang 2xx)
                res.status(error.response.status).json({
                    'meta': {
                        'code': 100,
                        'status': 'Failed',
                        'messages': 'Error sending notification'
                    },
                });
            } else if (error.request) {
                // Tidak ada respons dari server
                res.status(500).json({
                    'meta': {
                        'status': 500,
                        'messages': 'No response received from the server'
                    },
                });
            } else {
                // Kesalahan lainnya
                res.status(500).json({
                    'meta': {
                        'status': 500,
                        'messages': 'Error sending notification'
                    },
                });
            }
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
        const accessToken = await getAccessTokenBasraMobile();

        // const topicName = 'industry-tech';

        const message = {

            "message": {
                "token": to,
                "notification": notif,
                "data": data
            }
        };

        try {
            const responseData = await axios.post('https://fcm.googleapis.com/v1/projects/basra-mobile-86f72/messages:send', JSON.stringify(message), {
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


            console.info(` ${color.green('BASRA-MOBILE')}  | status: ${color.green('Success')}`);

            logger.info('BASRAMOBILEFCM | Notification sent successfully:', responseData.data);

        } catch (error: any) {

            if (error.response && error.response.data && error.response.data.error) {
                // Mengambil pesan kesalahan dari respons Firebase
                const firebaseErrorMessage = error.response.data.error.message;

                var errorMessage = '';

                if(firebaseErrorMessage == 'Requested entity was not found.'){
                    errorMessage = 'Device Token not Found'
                }else{

                    errorMessage = firebaseErrorMessage;
      
                }


                console.error(` ${color.green('BASRAMOBILEFCM')}  | status: ${color.red(errorMessage)}`);
                logger.error(`BASRAMOBILEFCM  | status: Failed | Firebase-error: ${errorMessage}`);
    
    
                res.status(200).json({
                    'meta': {
                        'code': 100,
                        'status': 'Failed',
                        'messages': `Error sending notification: ${errorMessage}`
                    },
                });
            } else if (error.response) {
                // Kesalahan respons dari server (misalnya, status code tidak dalam rentang 2xx)
                res.status(error.response.status).json({
                    'meta': {
                        'status': error.response.status,
                        'messages': 'Error sending notification'
                    },
                });

                logger.error(`BASRAMOBILEFCM  | status: ${error.response} | server Error `);
            } else if (error.request) {
                // Tidak ada respons dari server
                logger.error(`BASRAMOBILEFCM | status: 500 | server Error `);
                console.error(` ${color.green('HIRS')}  | status: ${color.red('SERVER ERROR')}`);
                res.status(500).json({
                    'meta': {
                        'status': 500,
                        'messages': 'No response received from the server'
                    },
                });
            } else {
                // Kesalahan lainnya
                res.status(500).json({
                    'meta': {
                        'status': 500,
                        'messages': 'Error sending notification'
                    },
                });
                logger.error(`BASRAMOBILEFCM | status: 500 | server Error `);

            }
        }
    }
};
