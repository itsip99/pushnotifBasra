"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.routesHIRS = void 0;
const express_1 = __importDefault(require("express"));
const modify_1 = require("./modify");
const image_1 = require("./image");
exports.routesHIRS = express_1.default.Router();
exports.routesHIRS.use(modify_1.modify);
exports.routesHIRS.use(image_1.fetch);
