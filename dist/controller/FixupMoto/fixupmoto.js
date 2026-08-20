"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendNotificationbyDeviceToken = exports.sendNotificationbyTopic = void 0;
const axios_1 = __importDefault(require("axios"));
const lodash_1 = __importDefault(require("lodash"));
const token_firebase_service_fixupMoto_1 = require("../../services/fixupMoto/token_firebase_service_fixupMoto");
const logger_1 = require("../../logger/logger");
const colors_1 = __importDefault(require("colors"));
const httpAgent_1 = require("../../config/httpAgent");
const handleError = (res, error, token) => {
    if (error.response && error.response.data && error.response.data.error) {
        const firebaseErrorMessage = error.response.data.error.message;
        res.status(error.response.status).json({
            meta: {
                status: error.response.status,
                messages: `Error sending notification: ${firebaseErrorMessage}`
            },
        });
        logger_1.logger.error(`FIXUPMOTTO | status: ${error.response.status} | TokenTo/Topic: ${token}`);
        console.error(`${colors_1.default.red('FIXUPMOTTO')}  | status: ${firebaseErrorMessage}`);
    }
    else if (error.response) {
        res.status(error.response.status).json({
            meta: {
                status: error.response.status,
                messages: 'Error sending notification'
            },
        });
    }
    else if (error.request) {
        res.status(500).json({
            meta: {
                status: 500,
                messages: 'No response received from the server'
            },
        });
    }
    else {
        logger_1.logger.error(`FIXUPMOTTO | status: 500 | server Error`);
        console.error(`${colors_1.default.red('FIXUPMOTTO')}  | status: ${colors_1.default.red('SERVER ERROR')}`);
        res.status(500).json({
            meta: {
                status: 500,
                messages: 'Error sending notification'
            },
        });
    }
};
const sendNotificationbyTopic = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { to, notif, data } = req.body;
    if (lodash_1.default.isEmpty(to) || lodash_1.default.isEmpty(notif)) {
        res.status(400).json({
            'meta': {
                'status': 400,
                'messages': 'to atau data tidak boleh kosong'
            },
        });
    }
    else {
        // Validation successful
        const accessToken = yield (0, token_firebase_service_fixupMoto_1.getAccessTokenFixUpMoto)();
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
            const responseData = yield axios_1.default.post('https://fcm.googleapis.com/v1/projects/fixupmoto-5e9cb/messages:send', JSON.stringify(message), {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                httpsAgent: httpAgent_1.fcmAgent
            });
            res.status(responseData.status).json({
                'meta': {
                    'code': 100,
                    'status': 'Success',
                    'messages': 'Success sending notification'
                },
            });
        }
        catch (error) {
            handleError(res, error, message.message.topic);
        }
    }
});
exports.sendNotificationbyTopic = sendNotificationbyTopic;
const sendNotificationbyDeviceToken = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { to, notif, data } = req.body;
    if (lodash_1.default.isEmpty(to) || lodash_1.default.isEmpty(notif)) {
        res.status(400).json({
            'meta': {
                'status': 400,
                'messages': 'to atau data tidak boleh kosong'
            },
        });
    }
    else {
        // Validation successful
        const accessToken = yield (0, token_firebase_service_fixupMoto_1.getAccessTokenFixUpMoto)();
        // const topicName = 'industry-tech';
        const message = {
            "message": {
                "token": to,
                "notification": notif,
                "data": data
            }
        };
        try {
            const responseData = yield axios_1.default.post('https://fcm.googleapis.com/v1/projects/fixupmoto-5e9cb/messages:send', JSON.stringify(message), {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                httpsAgent: httpAgent_1.fcmAgent
            });
            res.status(responseData.status).json({
                'meta': {
                    'code': 100,
                    'status': 'Success',
                    'messages': 'Success sending notification'
                },
            });
            console.error(` ${colors_1.default.green('FIXUPMOTOFCM')}  | status: ${colors_1.default.green('Success')}`);
            logger_1.logger.info('Notification sent successfully:', responseData.data);
        }
        catch (error) {
            handleError(res, error, message.message.token);
        }
    }
});
exports.sendNotificationbyDeviceToken = sendNotificationbyDeviceToken;
