import express, { Request, Response, response } from 'express';
import { getCachedjavaYogaToken } from '../../services/javaYoga/javaToken';
import axios from "axios";
import l from "lodash";
import { logger, loggerSuccess } from '../../logger/logger';


import color from 'colors';
import { JAVA_QUEUE, getChannel } from '../../config/rabbit';

// Prioritas tinggi + suara di Android (channel harus ada di app) dan iOS.
const ANDROID_CONFIG = {
    priority: "HIGH",
    notification: {
        channel_id: "javawellness_important",
        sound: "default",
        default_vibrate_timings: true,
        visibility: "PUBLIC"
    }
};

const APNS_CONFIG = {
    headers: { "apns-priority": "10" },
    payload: { aps: { sound: "default", "interruption-level": "time-sensitive" } }
};

const handleError = (res: Response, error: any, token: string) => {
    if (error.response && error.response.data && error.response.data.error) {
        const firebaseErrorMessage = error.response.data.error.message;
        const errorMessage = firebaseErrorMessage === 'Requested entity was not found.'
            ? 'Device Token not Found'
            : firebaseErrorMessage;

        console.error(` ${color.green('JAVAYOGA')}  | status: ${color.red(errorMessage)} || token/topic: ${token}`);
        logger.error(`JAVAYOGA  | status: Failed | Firebase-error: ${errorMessage} || TokenTo/Topic: ${token}`);

        res.status(200).json({
            meta: {
                code: 200,
                status: 'Failed',
                messages: `Error sending notification: ${errorMessage}`
            },
        });
    } else if (error.response) {
        logger.error(`JAVAYOGA | status: ${error.response} `);
        console.error(` ${color.green('JAVAYOGA')}  | status: ${color.red('Error sending notification')}`);

        res.status(error.response.status).json({
            meta: {
                code: 200,
                status: 'Failed',
                messages: 'Error sending notification'
            },
        });
    } else if (error.request) {
        logger.error(`JAVAYOGA | status: 500 | server Error `);
        console.error(` ${color.green('JAVAYOGA')}  | status: ${color.red('SERVER ERROR')}`);

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
        // Validation successful
        const accessToken = await getCachedjavaYogaToken();
        // console.log(accessToken)

        // const topicName = 'industry-tech';

        const message = {

            "message": {
                "topic": to,
                "notification": notif,
                "data": data,
                "android": ANDROID_CONFIG,
                "apns": APNS_CONFIG
            }
        };

        try {
            const responseData = await axios.post('https://fcm.googleapis.com/v1/projects/javayoga-f1963/messages:send', JSON.stringify(message), {
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

            console.error(` ${color.green('JAVAYOGAFCM')}  | status: ${color.green('Success')} `);


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
      // ?? ambil channel singleton
      const ch = await getChannel();
  
      // ?? payload untuk worker
      const job = {
        "message": {
          "token": to,
          "notification": notif,
          "data": data,
          "android": ANDROID_CONFIG,
          "apns": APNS_CONFIG
        }
      };
  
      // ?? kirim ke queue
      ch.sendToQueue(
        JAVA_QUEUE,
        Buffer.from(JSON.stringify(job)),
        { persistent: true }
      );
  
      // ?? respon ke client
      res.status(200).json({
        meta: {
          code: 100,
          status: "Success",
          messages: "Notification queued successfully"
        },
      });
  
      console.info(
        `${color.green("JAVAYOGAFCM")} | status: QUEUED | tokenTo=${to}`
      );
  
      loggerSuccess.info(`JAVA YOGA | Notification queued | MetaData: ${JSON.stringify(metaData || {})}`);
  
    } catch (error: any) {
      console.error("Queue push failed:", error?.message);
      res.status(500).json({
        meta: { status: 500, messages: "Failed to queue notification" }
      });
    }
  };

