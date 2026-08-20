import express, { Request, Response } from 'express';
import { sendNotificationbyDeviceToken, sendNotificationbyTopic, sendLoggingError } from '../../controller/HIRS/hirs';
import { adduserToGroup, createNotificationKey, removeuserFromGroup } from '../../controller/HIRS/CreateNotificationKey/createNotificationkey';
import { logger } from '../../logger/logger';


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
        case 'createNotificationGroupToken':
            await createNotificationKey(req, res);
            break;
            case 'addUsertoGroup':
                await adduserToGroup(req, res);
            break;
            case 'removeUserFromGroup':
                await removeuserFromGroup(req, res);
            break;
        default:
            logger.error(`[HIRS] ROUTE_INVALID_JENIS | jenis=${jenis} | body=${JSON.stringify(req.body)}`);
            res.status(400).json({
                'meta': {
                    'code': 400,
                    'messages': 'Invalid jenis value'
                },
            });
            break;
    }









});

modify.post('/log-error',sendLoggingError )

