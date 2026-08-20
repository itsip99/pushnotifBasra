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
const spkbasra_1 = require("../../controller/SPKbasra/spkbasra");
exports.modify = express_1.default.Router();
exports.modify.post('/modify', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { jenis } = req.body;
    switch (jenis) {
        case 'sendingNotifbyTopic':
            yield (0, spkbasra_1.sendNotificationbyTopic)(req, res);
            break;
        case 'sendingNotifbyDeviceToken':
            yield (0, spkbasra_1.sendNotificationbyDeviceToken)(req, res);
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
}));
