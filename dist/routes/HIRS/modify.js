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
exports.modify = void 0;
const express_1 = __importDefault(require("express"));
const hirs_1 = require("../../controller/HIRS/hirs");
const createNotificationkey_1 = require("../../controller/HIRS/CreateNotificationKey/createNotificationkey");
const logger_1 = require("../../logger/logger");
exports.modify = express_1.default.Router();
exports.modify.post('/modify', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { jenis } = req.body;
    switch (jenis) {
        case 'sendingNotifbyTopic':
            yield (0, hirs_1.sendNotificationbyTopic)(req, res);
            break;
        case 'sendingNotifbyDeviceToken':
            yield (0, hirs_1.sendNotificationbyDeviceToken)(req, res);
            break;
        case 'createNotificationGroupToken':
            yield (0, createNotificationkey_1.createNotificationKey)(req, res);
            break;
        case 'addUsertoGroup':
            yield (0, createNotificationkey_1.adduserToGroup)(req, res);
            break;
        case 'removeUserFromGroup':
            yield (0, createNotificationkey_1.removeuserFromGroup)(req, res);
            break;
        default:
            logger_1.logger.error(`[HIRS] ROUTE_INVALID_JENIS | jenis=${jenis} | body=${JSON.stringify(req.body)}`);
            res.status(400).json({
                'meta': {
                    'code': 400,
                    'messages': 'Invalid jenis value'
                },
            });
            break;
    }
}));
exports.modify.post('/log-error', hirs_1.sendLoggingError);
