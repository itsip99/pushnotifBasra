"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.routesInstagram = void 0;
const express_1 = __importDefault(require("express"));
const callback_1 = require("./callback");
exports.routesInstagram = express_1.default.Router();
exports.routesInstagram.use(callback_1.callback);
