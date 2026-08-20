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
exports.browse = void 0;
const express_1 = __importDefault(require("express"));
const javayoga_1 = require("../../controller/javaYoga/javayoga");
exports.browse = express_1.default.Router();
exports.browse.post('/browse', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { jenis } = req.body;
    switch (jenis) {
        case 'deviceToken':
            yield (0, javayoga_1.getDeviceToken)(req, res);
            break;
        default:
            res.status(400).json({
                'meta': {
                    'status': 400,
                    'messages': 'Invalid jenis value'
                },
            });
            break;
    }
}));
