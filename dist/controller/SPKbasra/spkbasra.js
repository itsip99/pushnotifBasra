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
const token_firebase_service_spkBasra_1 = require("../../services/SPKBasra/token_firebase_service_spkBasra");
const colors_1 = __importDefault(require("colors"));
const logger_1 = require("../../logger/logger");
const httpAgent_1 = require("../../config/httpAgent");
const handleError = (res, error, token) => {
    if (error.response && error.response.data && error.response.data.error) {
        const firebaseErrorMessage = error.response.data.error.message;
        const errorMessage = firebaseErrorMessage === 'Requested entity was not found.'
            ? 'Device Token not Found'
            : firebaseErrorMessage;
        console.error(` ${colors_1.default.green('SPKBASRA')}  | status: ${colors_1.default.red(errorMessage)} || token/topic: ${token}`);
        logger_1.logger.error(`SPKBASRA  | status: Failed | Firebase-error: ${errorMessage} || TokenTo/Topic: ${token}`);
        res.status(200).json({
            meta: {
                code: 200,
                status: 'Failed',
                messages: `Error sending notification: ${errorMessage}`
            },
        });
    }
    else if (error.response) {
        logger_1.logger.error(`SPKBASRA | status: ${error.response} `);
        console.error(` ${colors_1.default.green('SPKBASRA')}  | status: ${colors_1.default.red('Error sending notification')}`);
        res.status(error.response.status).json({
            meta: {
                code: 200,
                status: 'Failed',
                messages: 'Error sending notification'
            },
        });
    }
    else if (error.request) {
        logger_1.logger.error(`SPKBASRA | status: 500 | server Error `);
        console.error(` ${colors_1.default.green('SPKBASRA')}  | status: ${colors_1.default.red('SERVER ERROR')}`);
        res.status(500).json({
            meta: {
                status: 500,
                messages: 'No response received from the server'
            },
        });
    }
    else {
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
        const accessToken = yield (0, token_firebase_service_spkBasra_1.getAccessTokenSPKbasra)();
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
            const responseData = yield axios_1.default.post('https://fcm.googleapis.com/v1/projects/hris-mobile-flutter/messages:send', JSON.stringify(message), {
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
            console.error(` ${colors_1.default.green('SPKBASRAFCM')}  | status: ${colors_1.default.green('Success')}`);
            logger_1.logger.info('Notification sent successfully:', responseData.data);
        }
        catch (error) {
            handleError(res, error, message.message.topic);
        }
    }
    ;
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
        const accessToken = yield (0, token_firebase_service_spkBasra_1.getAccessTokenSPKbasra)();
        // const topicName = 'industry-tech';
        const message = {
            "message": {
                "token": to,
                "notification": notif,
                "data": data
            }
        };
        try {
            const responseData = yield axios_1.default.post('https://fcm.googleapis.com/v1/projects/hris-mobile-flutter/messages:send', JSON.stringify(message), {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                httpsAgent: httpAgent_1.fcmAgent
            });
            res.status(responseData.status).json({
                'meta': {
                    'status': responseData.status,
                    'messages': 'Success sending notification'
                },
            });
        }
        catch (error) {
            handleError(res, error, message.message.token);
        }
    }
});
exports.sendNotificationbyDeviceToken = sendNotificationbyDeviceToken;
