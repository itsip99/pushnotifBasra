"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.routesLSA = void 0;
const express_1 = __importDefault(require("express"));
const modify_1 = require("./modify");
exports.routesLSA = express_1.default.Router();
exports.routesLSA.use(modify_1.modify);
