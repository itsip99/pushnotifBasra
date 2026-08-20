import { sendNotificationbyTopic, sendNotificationbyDeviceToken } from "../../controller/javaYoga/javayoga";
import express, { Request, Response } from 'express';



export const modify = express.Router();

modify.post('/modify', async (req: Request, res: Response): Promise<void> => {

    const { jenis } = req.body;

    switch (jenis) {
        case 'sendingNotifbyTopic':
            await sendNotificationbyTopic(req, res);
            break;
        case 'sendingNotifbyDeviceToken':
            await sendNotificationbyDeviceToken(req, res);
            break;
        default:
            res.status(400).json({
                'meta': {
                    'code': 400,
                    'messages': 'Invalid jenis value'
                },
            });
            break;
    }









});

