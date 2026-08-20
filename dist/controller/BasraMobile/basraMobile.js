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
const colors_1 = __importDefault(require("colors"));
const token_firebase_service_basraMobile_1 = require("../../services/BasraMobile/token_firebase_service_basraMobile");
const logger_1 = require("../../logger/logger");
const httpAgent_1 = require("../../config/httpAgent");
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
        const accessToken = yield (0, token_firebase_service_basraMobile_1.getAccessTokenBasraMobile)();
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
            const responseData = yield axios_1.default.post('https://fcm.googleapis.com/v1/projects/basra-mobile-86f72/messages:send', JSON.stringify(message), {
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
            if (error.response && error.response.data && error.response.data.error) {
                // Mengambil pesan kesalahan dari respons Firebase
                const firebaseErrorMessage = error.response.data.error.message;
                console.error(`BasraMobile Error sending notification: ${firebaseErrorMessage}`);
                logger_1.logger.error(`FixupMotto | status: ${error.response} Firebase-error:`, firebaseErrorMessage);
                res.status(200).json({
                    'meta': {
                        'code': 100,
                        'status': 'Failed',
                        'messages': `Error sending notification: ${firebaseErrorMessage}`
                    },
                });
            }
            else if (error.response) {
                // Kesalahan respons dari server (misalnya, status code tidak dalam rentang 2xx)
                res.status(error.response.status).json({
                    'meta': {
                        'code': 100,
                        'status': 'Failed',
                        'messages': 'Error sending notification'
                    },
                });
            }
            else if (error.request) {
                // Tidak ada respons dari server
                res.status(500).json({
                    'meta': {
                        'status': 500,
                        'messages': 'No response received from the server'
                    },
                });
            }
            else {
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
        const accessToken = yield (0, token_firebase_service_basraMobile_1.getAccessTokenBasraMobile)();
        // const topicName = 'industry-tech';
        const message = {
            "message": {
                "token": to,
                "notification": notif,
                "data": data
            }
        };
        try {
            const responseData = yield axios_1.default.post('https://fcm.googleapis.com/v1/projects/basra-mobile-86f72/messages:send', JSON.stringify(message), {
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
            console.info(` ${colors_1.default.green('BASRA-MOBILE')}  | status: ${colors_1.default.green('Success')}`);
            logger_1.logger.info('BASRAMOBILEFCM | Notification sent successfully:', responseData.data);
        }
        catch (error) {
            if (error.response && error.response.data && error.response.data.error) {
                // Mengambil pesan kesalahan dari respons Firebase
                const firebaseErrorMessage = error.response.data.error.message;
                var errorMessage = '';
                if (firebaseErrorMessage == 'Requested entity was not found.') {
                    errorMessage = 'Device Token not Found';
                }
                else {
                    errorMessage = firebaseErrorMessage;
                }
                console.error(` ${colors_1.default.green('BASRAMOBILEFCM')}  | status: ${colors_1.default.red(errorMessage)}`);
                logger_1.logger.error(`BASRAMOBILEFCM  | status: Failed | Firebase-error: ${errorMessage}`);
                res.status(200).json({
                    'meta': {
                        'code': 100,
                        'status': 'Failed',
                        'messages': `Error sending notification: ${errorMessage}`
                    },
                });
            }
            else if (error.response) {
                // Kesalahan respons dari server (misalnya, status code tidak dalam rentang 2xx)
                res.status(error.response.status).json({
                    'meta': {
                        'status': error.response.status,
                        'messages': 'Error sending notification'
                    },
                });
                logger_1.logger.error(`BASRAMOBILEFCM  | status: ${error.response} | server Error `);
            }
            else if (error.request) {
                // Tidak ada respons dari server
                logger_1.logger.error(`BASRAMOBILEFCM | status: 500 | server Error `);
                console.error(` ${colors_1.default.green('HIRS')}  | status: ${colors_1.default.red('SERVER ERROR')}`);
                res.status(500).json({
                    'meta': {
                        'status': 500,
                        'messages': 'No response received from the server'
                    },
                });
            }
            else {
                // Kesalahan lainnya
                res.status(500).json({
                    'meta': {
                        'status': 500,
                        'messages': 'Error sending notification'
                    },
                });
                logger_1.logger.error(`BASRAMOBILEFCM | status: 500 | server Error `);
            }
        }
    }
});
exports.sendNotificationbyDeviceToken = sendNotificationbyDeviceToken;
