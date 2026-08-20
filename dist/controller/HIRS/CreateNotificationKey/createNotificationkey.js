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
exports.removeuserFromGroup = exports.adduserToGroup = exports.createNotificationKey = void 0;
const hirsToken_1 = require("../../../services/hirs/hirsToken");
const axios_1 = __importDefault(require("axios"));
const httpAgent_1 = require("../../../config/httpAgent");
const FCM_NOTIFICATION_URL = 'https://fcm.googleapis.com/fcm/notification';
const PROJECT_ID = '859317105403';
const TIMEOUT = 15000;
function makeHeaders(accessToken) {
    return {
        'Content-Type': 'application/json',
        'access_token_auth': 'true',
        'Authorization': `Bearer ${accessToken}`,
        'project_id': PROJECT_ID,
    };
}
function validateGroupFields(req, res) {
    const { notification_key_name, registration_ids } = req.body;
    if (!notification_key_name || !registration_ids) {
        res.status(400).json({
            meta: { code: 400, status: 'Failed', error: 'notification_key_name and registration_ids are required' },
        });
        return false;
    }
    return true;
}
const createNotificationKey = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!validateGroupFields(req, res))
        return;
    const { notification_key_name, registration_ids } = req.body;
    try {
        const accessToken = yield (0, hirsToken_1.getCachedHIRSToken)();
        const responseData = yield axios_1.default.post(FCM_NOTIFICATION_URL, {
            operation: 'create',
            notification_key_name,
            registration_ids,
        }, { headers: makeHeaders(accessToken), timeout: TIMEOUT, httpsAgent: httpAgent_1.fcmAgent });
        res.status(responseData.status).json({
            meta: { code: 100, status: 'Success', notification_key: responseData.data.notification_key },
        });
    }
    catch (error) {
        res.status(200).json({
            meta: { code: 200, status: 'Failed', messages: ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message },
        });
    }
});
exports.createNotificationKey = createNotificationKey;
const adduserToGroup = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _b;
    if (!validateGroupFields(req, res))
        return;
    const { notification_key_name, registration_ids, notification_key } = req.body;
    try {
        const accessToken = yield (0, hirsToken_1.getCachedHIRSToken)();
        const responseData = yield axios_1.default.post(FCM_NOTIFICATION_URL, {
            operation: 'add',
            notification_key_name,
            notification_key,
            registration_ids,
        }, { headers: makeHeaders(accessToken), timeout: TIMEOUT, httpsAgent: httpAgent_1.fcmAgent });
        res.status(responseData.status).json({
            meta: { code: 100, status: 'Success', notification_key: responseData.data.notification_key },
        });
    }
    catch (error) {
        res.status(200).json({
            meta: { code: 200, status: 'Failed', messages: ((_b = error === null || error === void 0 ? void 0 : error.response) === null || _b === void 0 ? void 0 : _b.data) || error.message },
        });
    }
});
exports.adduserToGroup = adduserToGroup;
const removeuserFromGroup = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _c;
    if (!validateGroupFields(req, res))
        return;
    const { notification_key_name, registration_ids, notification_key } = req.body;
    try {
        const accessToken = yield (0, hirsToken_1.getCachedHIRSToken)();
        const responseData = yield axios_1.default.post(FCM_NOTIFICATION_URL, {
            operation: 'remove',
            notification_key_name,
            notification_key,
            registration_ids,
        }, { headers: makeHeaders(accessToken), timeout: TIMEOUT, httpsAgent: httpAgent_1.fcmAgent });
        res.status(responseData.status).json({
            meta: { code: 100, status: 'Success', notification_key: responseData.data.notification_key },
        });
    }
    catch (error) {
        res.status(200).json({
            meta: { code: 200, status: 'Failed', messages: ((_c = error === null || error === void 0 ? void 0 : error.response) === null || _c === void 0 ? void 0 : _c.data) || error.message },
        });
    }
});
exports.removeuserFromGroup = removeuserFromGroup;
