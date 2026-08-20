"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetch = void 0;
const express_1 = __importDefault(require("express"));
exports.fetch = express_1.default.Router();
exports.fetch.get('/iconHIRS', (req, res) => {
    // Assuming you have an image stored locally with the name "image.jpg"
    // You can send the image as a response using res.sendFile()
    res.sendFile(__dirname + '/1.png');
});
