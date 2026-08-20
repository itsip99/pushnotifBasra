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
const javaToken_1 = require("../../services/javaYoga/javaToken");
const axios_1 = __importDefault(require("axios"));
const lodash_1 = __importDefault(require("lodash"));
const logger_1 = require("../../logger/logger");
const colors_1 = __importDefault(require("colors"));
const rabbit_1 = require("../../config/rabbit");
const handleError = (res, error, token) => {
    if (error.response && error.response.data && error.response.data.error) {
        const firebaseErrorMessage = error.response.data.error.message;
        const errorMessage = firebaseErrorMessage === 'Requested entity was not found.'
            ? 'Device Token not Found'
            : firebaseErrorMessage;
        console.error(` ${colors_1.default.green('JAVAYOGA')}  | status: ${colors_1.default.red(errorMessage)} || token/topic: ${token}`);
        logger_1.logger.error(`JAVAYOGA  | status: Failed | Firebase-error: ${errorMessage} || TokenTo/Topic: ${token}`);
        res.status(200).json({
            meta: {
                code: 200,
                status: 'Failed',
                messages: `Error sending notification: ${errorMessage}`
            },
        });
    }
    else if (error.response) {
        logger_1.logger.error(`JAVAYOGA | status: ${error.response} `);
        console.error(` ${colors_1.default.green('JAVAYOGA')}  | status: ${colors_1.default.red('Error sending notification')}`);
        res.status(error.response.status).json({
            meta: {
                code: 200,
                status: 'Failed',
                messages: 'Error sending notification'
            },
        });
    }
    else if (error.request) {
        logger_1.logger.error(`JAVAYOGA | status: 500 | server Error `);
        console.error(` ${colors_1.default.green('JAVAYOGA')}  | status: ${colors_1.default.red('SERVER ERROR')}`);
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
        const accessToken = yield (0, javaToken_1.getCachedjavaYogaToken)();
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
            const responseData = yield axios_1.default.post('https://fcm.googleapis.com/v1/projects/javayoga-f1963/messages:send', JSON.stringify(message), {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            res.status(responseData.status).json({
                'meta': {
                    'code': 100,
                    'status': 'Success',
                    'messages': 'Success sending notification'
                },
            });
            console.error(` ${colors_1.default.green('JAVAYOGAFCM')}  | status: ${colors_1.default.green('Success')} `);
            logger_1.logger.info('Notification sent successfully:', responseData.data);
        }
        catch (error) {
            handleError(res, error, message.message.topic);
        }
    }
});
exports.sendNotificationbyTopic = sendNotificationbyTopic;
const sendNotificationbyDeviceToken = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { to, notif, data, metaData } = req.body;
    if (lodash_1.default.isEmpty(to) || lodash_1.default.isEmpty(notif)) {
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
        const ch = yield (0, rabbit_1.getChannel)();
        // ?? payload untuk worker
        const job = { "message": { "token": to, "notification": notif, "data": data } };
        // ?? kirim ke queue
        ch.sendToQueue(rabbit_1.JAVA_QUEUE, Buffer.from(JSON.stringify(job)), { persistent: true });
        // ?? respon ke client
        res.status(200).json({
            meta: {
                code: 100,
                status: "Success",
                messages: "Notification queued successfully"
            },
        });
        console.info(`${colors_1.default.green("JAVAYOGAFCM")} | status: QUEUED | tokenTo=${to}`);
        logger_1.loggerSuccess.info(`JAVA YOGA | Notification queued | MetaData: ${JSON.stringify(metaData || {})}`);
    }
    catch (error) {
        console.error("Queue push failed:", error === null || error === void 0 ? void 0 : error.message);
        res.status(500).json({
            meta: { status: 500, messages: "Failed to queue notification" }
        });
    }
});
exports.sendNotificationbyDeviceToken = sendNotificationbyDeviceToken;
